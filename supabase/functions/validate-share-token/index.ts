import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ShareLinkData {
  id: string;
  person_id: string;
  expires_at: string;
  passcode_hash: string | null;
  allow_export: boolean;
  mask_sensitive: boolean;
  status: string;
}

interface PersonData {
  id: string;
  name: string;
  price_per_cig: number | null;
  cig_count: number;
  eff_price_per_cig: number;
  cig_total: number;
  loans_total: number;
  grand_total: number;
}

interface EventData {
  id: string;
  delta: number;
  created_at: string;
}

interface LoanData {
  id: string;
  amount: number;
  loan_date: string;
  reason: string | null;
  created_at: string;
}

// Simple hash function for passcode verification
async function hashPasscode(passcode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, passcode } = await req.json();

    if (!token) {
      console.log("No token provided");
      return new Response(
        JSON.stringify({ error: "Token required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Validating token:", token.substring(0, 8) + "...");

    // Fetch share link
    const { data: shareLink, error: linkError } = await supabase
      .from("share_links")
      .select("*")
      .eq("token", token)
      .single();

    if (linkError || !shareLink) {
      console.log("Share link not found:", linkError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const link = shareLink as ShareLinkData;

    // Check if revoked
    if (link.status === "revoked") {
      console.log("Link has been revoked");
      return new Response(
        JSON.stringify({ error: "This link has been revoked" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(link.expires_at) < new Date()) {
      console.log("Link has expired");
      // Update status to expired
      await supabase
        .from("share_links")
        .update({ status: "expired" })
        .eq("id", link.id);

      return new Response(
        JSON.stringify({ error: "This link has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (link.status === "expired") {
      console.log("Link status is expired");
      return new Response(
        JSON.stringify({ error: "This link has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check passcode if required
    if (link.passcode_hash) {
      if (!passcode) {
        console.log("Passcode required but not provided");
        return new Response(
          JSON.stringify({ error: "Passcode required", requiresPasscode: true }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const providedHash = await hashPasscode(passcode);
      if (providedHash !== link.passcode_hash) {
        console.log("Invalid passcode");
        return new Response(
          JSON.stringify({ error: "Invalid passcode" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Log access
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    await supabase.from("access_logs").insert({
      share_link_id: link.id,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Update last accessed and access count
    await supabase
      .from("share_links")
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (shareLink.access_count || 0) + 1,
      })
      .eq("id", link.id);

    // Fetch person data
    const { data: person, error: personError } = await supabase
      .from("v_person_financials")
      .select("*")
      .eq("id", link.person_id)
      .single();

    if (personError || !person) {
      console.log("Person not found:", personError);
      return new Response(
        JSON.stringify({ error: "Data not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch events
    const { data: events } = await supabase
      .from("events")
      .select("id, delta, created_at")
      .eq("person_id", link.person_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    // Fetch loans
    const { data: loans } = await supabase
      .from("loans")
      .select("id, amount, loan_date, reason, created_at")
      .eq("person_id", link.person_id)
      .eq("is_deleted", false)
      .order("loan_date", { ascending: false });

    // Apply masking if enabled
    let personData = person as PersonData;
    let eventsData = (events || []) as EventData[];
    let loansData = (loans || []) as LoanData[];

    if (link.mask_sensitive) {
      // Mask loan amounts (show only first and last digit)
      loansData = loansData.map((loan) => ({
        ...loan,
        amount: Math.round(loan.amount / 100) * 100, // Round to nearest 100
        reason: loan.reason ? "***" : null,
      }));
    }

    console.log("Successfully validated token and fetched data");

    return new Response(
      JSON.stringify({
        success: true,
        person: personData,
        events: eventsData,
        loans: loansData,
        settings: {
          allowExport: link.allow_export,
          maskSensitive: link.mask_sensitive,
        },
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-Robots-Tag": "noindex, nofollow",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        } 
      }
    );
  } catch (error) {
    console.error("Error validating share token:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
