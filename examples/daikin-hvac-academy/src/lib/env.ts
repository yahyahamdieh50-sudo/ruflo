/** Lazy, validated environment access. Never import secrets into client components. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl() { return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""); },
  get isProd() { return process.env.NODE_ENV === "production"; },
  get appSecret() {
    const s = req("APP_SECRET");
    if (s.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
    return s;
  },
  get databaseUrl() { return req("DATABASE_URL"); },
  get databaseSsl() { return process.env.DATABASE_SSL === "true"; },
  get stripeKey() { return process.env.STRIPE_SECRET_KEY || ""; },
  get stripeWebhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || ""; },
  get stripeAutomaticTax() { return process.env.STRIPE_AUTOMATIC_TAX === "true"; },
  get smtpHost() { return process.env.SMTP_HOST || ""; },
  get emailFrom() { return process.env.EMAIL_FROM || "Installation Academy <no-reply@localhost>"; },
  get storageDriver() { return (process.env.STORAGE_DRIVER || "local") as "local" | "s3"; },
  get anthropicKey() { return process.env.ANTHROPIC_API_KEY || ""; },
  get assistantModel() { return process.env.ASSISTANT_MODEL || "claude-sonnet-5-5"; },
  get aedPerUsd() { return Number(process.env.AED_PER_USD || 3.6725); },
};

export const DISCLAIMER_EN =
  "Independent HVAC training platform. Not affiliated with, endorsed by, or certified by Daikin Industries, Ltd.";
export const DISCLAIMER_AR =
  "منصة تدريب مستقلة في مجال التكييف والتبريد. غير تابعة لشركة Daikin Industries, Ltd. ولا معتمدة أو مصدّق عليها منها.";
