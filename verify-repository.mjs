import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const exists = (name) => fs.existsSync(path.join(root, name));
const html = read("index.html");
const markup = html.slice(0, html.indexOf('<script type="application/json"'));
const visibleMarkup = markup.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const sw = read("service-worker.js");
const manifest = JSON.parse(read("manifest.webmanifest"));
const pkg = JSON.parse(read("package.json"));
const checks = [];
const check = (name, pass) => checks.push({name, pass:Boolean(pass)});
const count = (pattern, text=html) => [...text.matchAll(pattern)].length;
const addUtcDays = (iso, amount) => { const [y,m,d]=iso.split("-").map(Number); return new Date(Date.UTC(y,m-1,d+amount)).toISOString().slice(0,10); };

function walk(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if([".git","node_modules"].includes(entry.name)) return [];
    const full=path.join(directory,entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}
function pngSize(name){ const b=fs.readFileSync(path.join(root,name)); return [b.readUInt32BE(16),b.readUInt32BE(20)]; }

const required=[
  ".gitignore",".nojekyll","README.md","DEPLOY-INSTRUCTIONS.txt","app-cover.png","icon-192.png","icon-512.png","icon.svg",
  "index.html","manifest.webmanifest","package.json","service-worker.js","scripts/verify-repository.mjs",".github/workflows/verify.yml"
];
required.forEach(f=>check(`Required file: ${f}`,exists(f)));
check("Stale dated campaign artwork removed", !exists("INVICTICUS-CHALLENGE-ARTWORK.png"));

const pages=["home","today","reset","health","photos","mountains","journey","goals","reviews","data"];
const pageIds=[...markup.matchAll(/<section class="page(?: active)?" id="([^"]+)"/g)].map(m=>m[1]);
check("Ten primary sections remain", JSON.stringify(pageIds)===JSON.stringify(pages));
pages.forEach(id=>check(`Page exists: ${id}`,pageIds.includes(id)));

// Campaign identity and boundaries.
check("Schema v64 remains active", /const VERSION = 64;/.test(html));
check("Oct 30 campaign start is canonical", /const CAMPAIGN_START = "2026-10-30";/.test(html));
check("Dec 31 campaign end is canonical", /const CAMPAIGN_END = "2026-12-31";/.test(html));
check("Oct 30 restart timestamp is canonical", /const RESTART_AT = "2026-10-30T00:00:00-07:00";/.test(html));
check("Oct 30 restart ID is unique", /const RESTART_ID = "invicticus-restart-2026-10-30";/.test(html));
check("Oct 30 progress epoch is active", /const PROGRESS_EPOCH = "the-52nd-watch-invicticus-v2-oct30-restart";/.test(html));
check("Campaign ID distinguishes Oct 30 run", /const CAMPAIGN_ID = "the-52nd-watch-invicticus-oct30-2026";/.test(html));
check("Visible hero shows 63-day window", /63 DAYS · 52 BRICKS · OCT 30–DEC 31/.test(visibleMarkup));
check("Visible UI contains no stale Oct 19 launch", !/Oct(?:ober)?\s+19/i.test(visibleMarkup));
check("Visible UI contains no stale 74-day window", !/74\s+(?:DAYS|calendar days)/i.test(visibleMarkup));
check("Full duty is active at launch", /FULL DUTY · ACTIVE AT LAUNCH/.test(visibleMarkup));
check("Challenge constitution is visible", /Winter Arc Law/.test(visibleMarkup) && /Wall Total/.test(visibleMarkup) && /Pace Gate/.test(visibleMarkup));
check("Eleven non-brick days of margin are stated", /11 NON-BRICK DAYS OF MARGIN/.test(visibleMarkup));

// Brick law and daily standards.
check("52-brick wall exists", /Array\.from\(\{ length: 52 \}/.test(html) && /function wallQualifies/.test(html));
check("Exactly six daily standard controls exist", count(/data-check="[^"]+"/g,markup)===6);
for(const key of ["prayer","water","rehab","hevy","looks","noSlither"]) check(`Daily standard ${key} exists`, new RegExp(`data-check="${key}"`).test(markup));
check("Brick law requires closeout six checks and integrity", /closed\+six-checks\+zero-tolerance-kept/.test(html));
check("Streak and wall total are distinguished in visible law", /A miss can break the streak without erasing wall total/.test(visibleMarkup));
check("Readiness can modify training without automatic failure", /GREEN \/ YELLOW \/ RED changes the correct training dose/.test(visibleMarkup));
check("Prelaunch mode remains brick-safe", /const preLaunch = daysBetween\(today, CAMPAIGN_START\) > 0;/.test(html) && /setup only—no brick can be earned early/.test(html));
check("Internal date audit uses Oct 30 Day 1", /October 30 is Invicticus Day 1/.test(html));
check("Internal date audit uses Oct 31 Day 2", /October 31 is Invicticus Day 2/.test(html));

// Review logic.
check("October launch baseline gate is 2 bricks", /October Invicticus Launch Baseline", brickTarget: 2/.test(html));
check("November pace gate is 32 bricks", /November Invicticus Bulking Review", brickTarget: 32/.test(html));
check("December summit gate is 52 bricks", /December Invicticus Review \+ Summit", brickTarget: 52/.test(html));
check("Review UI names Oct 31 Nov 30 Dec 31", /October 31/.test(visibleMarkup) && /November 30/.test(visibleMarkup) && /December 31/.test(visibleMarkup));
check("Review goal calls October a baseline", /October baseline \+ review/.test(html));
check("Review goal avoids fake October trend", /Oct 30–31 launch baseline/.test(html));

// Reward ladder and exact Oct 30-derived dates.
const gates=[7,10,14,18,21,25,28,32,35,39,42,46,49,52];
const expected={7:"2026-11-05",10:"2026-11-08",14:"2026-11-12",18:"2026-11-16",21:"2026-11-19",25:"2026-11-23",28:"2026-11-26",32:"2026-11-30",35:"2026-12-03",39:"2026-12-07",42:"2026-12-10",46:"2026-12-14",49:"2026-12-17",52:"2026-12-20"};
check("Fourteen wall checkpoints exist", /const WALL_CHECKPOINTS/.test(html) && gates.every(g=>new RegExp(`\\{"target": ${g}, "name":`).test(html)));
check("Reward dates derive from campaign start", /earliestDate: addDays\(CAMPAIGN_START, Number\(definition\.brickTarget\) - 1\)/.test(html));
check("All earliest unlock dates mathematically match Oct 30", Object.entries(expected).every(([g,d])=>addUtcDays("2026-10-30",Number(g)-1)===d));
check("Main Drop 01 defaults to Mako3", /"brickTarget": 7, "name": "Innova Mako3"/.test(html));
check("Bonus Drop 01 defaults to Nuke SS", /"brickTarget": 10[\s\S]{0,180}"name": "Discraft Nuke SS"/.test(html));
check("Bonus Drop 02 defaults to Neutron Detour", /"brickTarget": 18[\s\S]{0,180}"name": "MVP Neutron Detour · 170–175 g"/.test(html));
check("Drop 02 Lobster remains", /brickTarget: 14, name: "Mint Discs Lobster · 170–175 g"/.test(html));
check("Sleep Fortress remains", /brickTarget: 21, name: "Sleep Fortress Upgrade"/.test(html));
check("Fitted Style remains", /brickTarget: 28, name: "Fitted Style Upgrade"/.test(html));
check("Outside Mission remains", /brickTarget: 35, name: "Outside Mission"/.test(html));
check("Training Recovery drop remains", /brickTarget: 42, name: "Premium Training \/ Recovery Upgrade"/.test(html));
check("Career Leverage remains", /brickTarget: 49, name: "Career Leverage Fund"/.test(html));
check("Summit reward uses 52 crest", /name: "Invicticus Summit Reward", category: "Summit", icon: "52"/.test(html));
check("Claim Bank Swap workflow remains", /data-cache-acquired/.test(html) && /data-cache-bank/.test(html) && /data-cache-swap/.test(html));
check("Reward eligibility is brick-count based", /function rewardMetrics/.test(html) && /const qualified = built >= target/.test(html));
check("Supply timeline exists on Home", /id="homeSupplyTimeline"/.test(markup) && /function renderSupplyTimeline/.test(html));

// Strength and recovery systems preserved.
check("Iron Ledger has six missions", count(/id: "(?:INC30|OHP185|CHIN130|P500|CURL135|SQ200)"/g,html)===6);
check("Incline target 250x8 remains", /target: "250 × 8"/.test(html));
check("OHP target 185x5 remains", /target: "185 × 5"/.test(html));
check("Weighted chin target +130x6 remains", /target: "\+130 × 6"/.test(html));
check("Pull-up hour target remains 500", /target: "500 \/ 60 min"/.test(html));
check("Curl target 135x5 remains", /target: "135 × 5"/.test(html));
check("Squat remains recovery-sensitive", /id: "SQ200"[\s\S]{0,260}recoverySensitive: true/.test(html));
check("Hevy remains workout-detail source", /Hevy remains the workout-detail source of truth/.test(html));
check("Five body-status sliders remain", count(/data-pain="[^"]+"/g,markup)===5);
check("Recovery command remains", /id="recoveryCommandCard"/.test(markup));
check("Return to Mountains remains", /First 14er/.test(html) && /Desolation Wilderness/.test(html));

// Legacy and reset law.
check("Historical 26-day proof remains canonical", /historicalWallBest: 26/.test(html));
check("90-day No-Slither proof remains canonical", /noSlither90Complete: true/.test(html) && /historicalBestAttentionStreak: 90/.test(html));
check("Prior earned badges are converted to legacy proof", /Convert earned active badges from the prior run into historical proof/.test(html));
check("Real-life goals and todos survive active reset", /Keep current Career \/ Life \/ Recovery actions active/.test(html) && /Preserve user-authored goals and evidence/.test(html));
check("Active rewards reset to defaultRewards", /campaign\.rewards = defaultRewards\(\);/.test(html));
check("Current-run reviews reset", /campaign\.monthlyReviews = \{\}/.test(html));
check("Current-run surprise state resets", /campaign\.surprisesSeen = \{\}/.test(html) && /campaign\.surpriseHistory = \[\]/.test(html));
check("Reset reason says Friday Oct 30", /Invicticus active run begins Friday Oct 30, 2026/.test(html));

// UX, mobile, and PWA.
check("Mobile dock exists", /class="mobile-dock"/.test(markup));
check("Mobile top nav is removed at small widths", /@media\(max-width:899px\)[\s\S]*?\.nav\{display:none!important\}/.test(html));
check("44px minimum touch targets remain", /min-height:44px/.test(html));
check("No duplicate DOM IDs", (()=>{const ids=[...markup.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]); return ids.length===new Set(ids).size;})());
const ids=new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]));
check("Every data-jump target resolves", [...markup.matchAll(/data-jump="([^"]+)"/g)].every(m=>ids.has(m[1])));
check("Every data-scroll target resolves", [...markup.matchAll(/data-scroll="([^"]+)"/g)].every(m=>ids.has(m[1])));
check("Manifest is repo-relative", manifest.id==="./" && manifest.scope==="./" && manifest.start_url==="./index.html#home");
check("Manifest describes 63-day Oct 30 run", /Oct 30 through Dec 31, 2026: 63 days/.test(manifest.description));
check("Manifest has two icons", Array.isArray(manifest.icons) && manifest.icons.length===2);
check("App cover is 1024 square", JSON.stringify(pngSize("app-cover.png"))===JSON.stringify([1024,1024]));
check("192 icon dimensions correct", JSON.stringify(pngSize("icon-192.png"))===JSON.stringify([192,192]));
check("512 icon dimensions correct", JSON.stringify(pngSize("icon-512.png"))===JSON.stringify([512,512]));
check("Social cover now points to date-neutral app cover", /property="og:image" content="\.\/app-cover\.png"/.test(html) && /name="twitter:image" content="\.\/app-cover\.png"/.test(html));
check("Service worker cache is Winter Arc V2.1 Oct30 r1", /winter-arc-invicticus-v2-1-oct30-2026-r1/.test(sw));
check("Service worker does not cache stale dated artwork", !/INVICTICUS-CHALLENGE-ARTWORK/.test(sw));
check("Service worker cache is repo-scoped", /CACHE_SCOPE_ID/.test(sw) && /CACHE_PREFIX/.test(sw));
check("Controlled SW update remains", /SKIP_WAITING/.test(sw));
check("Package version is 2.1.0", pkg.version==="2.1.0");
check("Runtime label distinguishes release from schema", /WINTER ARC V2\.1 · OCT 30 EDITION · schema v\$\{VERSION\}/.test(html));

// Surprise layer remains non-gating.
check("Watch surprise dialog exists", /id="watchSurprise"/.test(markup));
check("Watch seal exists", /id="watchSeal"/.test(markup) && /function touchWatchSeal/.test(html));
check("Watch dispatch exists", /id="watchDispatch"/.test(markup) && /const WATCH_DISPATCHES/.test(html));
check("Record surprise occurs at Brick 27", /id: "record-broken", minBricks: 27/.test(html));
check("Summit surprise occurs at Brick 52", /id: "invicticus-crown", minBricks: 52/.test(html));
check("Full-duty surprise is active-run status", /id: "full-duty-return", onOrAfter: "2026-10-30"/.test(html) && /FULL DUTY · ACTIVE/.test(html));
check("Surprises do not alter wall rule", /V2\.0 Watch surprise layer remains isolated from brick rules/.test(html));

// Compatibility and privacy.
for(const v of [59,60,61,62,63,64]) check(`Restore compatibility v${v} remains`, new RegExp(`(?:project-52-private-backup-v${v}|project-northstar-final92-private-backup-v${v})`).test(html));
const files=walk(root);
const rel=files.map(f=>path.relative(root,f));
check("No private backup JSON committed", rel.every(f=>!/(?:private|restore|backup.*\.json)/i.test(f)));
check("No personal JPEG HEIC MOV files committed", rel.every(f=>!/\.(?:jpe?g|heic|heif|mov)$/i.test(f)));
const textFiles=files.filter(f=>
  path.relative(root,f) !== "scripts/verify-repository.mjs" &&
  /\.(?:html|js|mjs|json|md|txt|yml|yaml|svg)$/i.test(f) ||
  [".gitignore",".nojekyll"].includes(path.basename(f))
);
const publicText=textFiles.map(f=>fs.readFileSync(f,"utf8")).join("\n");
check("No embedded personal image payload", !/data:image\/(?:jpeg|png|webp|heic|heif);base64,/i.test(publicText));
check("No embedded private-state bootstrap", !/localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(\{"version":64/.test(publicText));
const privateMarkers=["R100000218772991","128271.49","98271.49","American Funds","SoFi Emergency Fund"];
check("No private finance or claim snapshot committed", privateMarkers.every(x=>!publicText.toLowerCase().includes(x.toLowerCase())));

// Parse checks.
const inlineScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m=>!/type="application\/json"/.test(m[0])).map(m=>m[1]);
try{inlineScripts.forEach(script=>new vm.Script(script));check("Application JavaScript parses",inlineScripts.length>=1);}catch(e){console.error(e);check("Application JavaScript parses",false);}
try{new vm.Script(sw);check("Service worker JavaScript parses",true);}catch(e){console.error(e);check("Service worker JavaScript parses",false);}

const failed=checks.filter(c=>!c.pass);
for(const c of checks) console.log(`${c.pass?"PASS":"FAIL"}  ${c.name}`);
console.log(`\n${checks.length-failed.length}/${checks.length} repository checks passed.`);
if(failed.length) process.exitCode=1;
