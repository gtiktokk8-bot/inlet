// Draft goal text organized by the assessment the BCBA builds from.
// These are starting points to individualize — NOT reproductions of any assessment's protected content.
export const GOAL_BANK: { source: string; domain: string; name: string; goal: string; data_type: "trial" | "frequency" | "duration" | "task_analysis"; sd?: string; steps?: string[] }[] = [
  { source: "VB-MAPP", domain: "Mand", name: "Mands for preferred items", goal: "Will independently request 10 preferred items using vocal speech (or AAC) across 3 consecutive sessions with 80% independence.", data_type: "trial", sd: "(item in sight)" },
  { source: "VB-MAPP", domain: "Listener", name: "Receptive ID — common objects", goal: "Will touch the named common object from an array of 3 in 8/10 opportunities across 3 sessions.", data_type: "trial", sd: "Touch the ___" },
  { source: "VB-MAPP", domain: "Listener", name: "Follows 2-step instructions", goal: "Will follow 2-step related instructions without visual cues in 8/10 opportunities across 3 sessions.", data_type: "trial", sd: "Get your ___ and ___" },
  { source: "VB-MAPP", domain: "Intraverbal", name: "Fill-ins", goal: "Will complete 10 common fill-in phrases with 80% accuracy across 3 sessions.", data_type: "trial", sd: "You sleep in a ___" },
  { source: "ABLLS-R", domain: "Tact", name: "Labels actions", goal: "Will label 25 common actions when shown a picture or live model with no prompt across 2 settings.", data_type: "trial", sd: "What is he doing?" },
  { source: "ABLLS-R", domain: "Imitation", name: "Motor imitation", goal: "Will imitate 20 gross motor actions within 3 seconds of the model in 9/10 opportunities.", data_type: "trial", sd: "Do this" },
  { source: "AFLS", domain: "Self-care", name: "Handwashing", goal: "Will independently complete all steps of handwashing with no more than one gestural prompt across 3 sessions.", data_type: "task_analysis", steps: ["Turn on water", "Wet hands", "Apply soap", "Scrub 20 seconds", "Rinse", "Turn off water", "Dry hands"] },
  { source: "AFLS", domain: "Self-care", name: "Tooth brushing", goal: "Will independently complete the tooth-brushing chain across 3 sessions.", data_type: "task_analysis", steps: ["Get toothbrush", "Apply toothpaste", "Brush top teeth", "Brush bottom teeth", "Rinse mouth", "Rinse brush", "Put away"] },
  { source: "PEAK", domain: "Intraverbal", name: "Category fill-ins", goal: "Will name 3 items in a category when asked, for 10 categories, with 80% accuracy.", data_type: "trial", sd: "Tell me some animals" },
  { source: "EFL", domain: "Communication", name: "Requests a break", goal: "Will request a break (card or vocal approximation) in place of elopement in 80% of opportunities across 3 sessions.", data_type: "trial", sd: "(demand placed)" },
  { source: "custom", domain: "Behavior reduction", name: "Elopement", goal: "Reduce elopement from baseline to ≤1 per hour across 3 consecutive sessions.", data_type: "frequency" },
  { source: "custom", domain: "Behavior reduction", name: "Tantrum", goal: "Reduce tantrum duration to ≤2 minutes per episode across 3 consecutive sessions.", data_type: "duration" },
  { source: "custom", domain: "Behavior reduction", name: "Aggression toward others", goal: "Reduce aggression from baseline to 0 across 5 consecutive sessions.", data_type: "frequency" },
];
