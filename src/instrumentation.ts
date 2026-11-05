// Runs once when the server starts. The clinic's time zone drives every server-rendered
// "today", week boundary and clock time; Node honors a runtime TZ change.
// v1: per-org time zone from the orgs table instead of a constant.
export async function register() {
  process.env.TZ = process.env.CLINIC_TZ || "America/New_York";
}
