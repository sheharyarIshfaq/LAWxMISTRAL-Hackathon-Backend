// Rebuilds data/funders/funders.json from the legal team's list (data/funders.csv), platform registrations and
// web-discovered funders (data/funders/discovered.json). Usage: npm run import-funders
import { rebuildFunders } from "../src/services/funders.ts";

const r = await rebuildFunders();
console.log(`✓ ${r.total} funders: ${r.curated} from the legal team's list (${r.merged} completed with web facts), ${r.platform} registered on the platform, ${r.total - r.curated - r.platform} found only on the web`);
