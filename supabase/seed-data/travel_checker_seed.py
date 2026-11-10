#!/usr/bin/env python3
"""Seeds/refreshes the travel checker data (states, rules, alerts). Re-runnable: replaces ALL rows in the three tables.
Run from steer-me-app/:  python3 supabase/seed-data/travel_checker_seed.py
Every rule needs a source and a verified date. Edit this file, bump VERIFIED, re-run. Rules were researched 2026-10-08;
see DOCS/vet-documents-research-and-coggins-strategy.md. Rule wording is a GUIDE, not legal advice."""
import json, os, urllib.request, urllib.error
VERIFIED = "2026-10-08"   # default for rules not re-read since the first research pass
V2 = "2026-11-09"         # rules re-read or changed in the 2026-11-09 update (see DOCS/travel-checker-update-2026-11-09.md)
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, "..", ".."))
def env(f, k):
    for l in open(os.path.join(APP, f)):
        if l.startswith(k + "="): return l.split("=", 1)[1].strip().strip("\"'")
URL, KEY = env(".env", "EXPO_PUBLIC_SUPABASE_URL"), env(".env.local", "SUPABASE_SERVICE_ROLE_KEY")
def call(method, path, body=None):
    r = urllib.request.Request(URL + path, data=None if body is None else json.dumps(body).encode(), method=method,
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(r) as x: return x.status
    except urllib.error.HTTPError as e: raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()[:300]}")

STATES = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"}
OFFICES = {
 "TX": ("Texas Animal Health Commission", "https://www.tahc.texas.gov/", "512-719-0777 or 1-800-550-8242 ext. 777", "permits@tahc.texas.gov"),
 "NV": ("Nevada Dept. of Agriculture, Entry Permits", "https://agri.nv.gov/Animals/Animal_Disease/Import_Requirements/", "775-353-3709", "entrypermits@agri.nv.gov"),
 "MO": ("Missouri Dept. of Agriculture, Animal Health", "https://agriculture.mo.gov/animals/rules.php", "573-751-3377", None),
 "NM": ("New Mexico Livestock Board", "https://www.nmlbonline.com/import", "505-841-6161 (entry permits: 800-432-6889)", None),
 "AZ": ("Arizona Dept. of Agriculture, Animal Services", "https://agriculture.az.gov/", "602-542-4293", None),
 "OK": ("Oklahoma Dept. of Agriculture, Food and Forestry, Animal Industry", "https://ag.ok.gov/divisions/animal-industry-state-veterinarian/", "405-522-6141 (cattle 405-522-6128; equine 405-522-6138)", None),
}
S = lambda name, url, conf: dict(source_name=name, source_url=url, confidence=conf)
USEF = S("US Equestrian: interstate travel for horses", "https://www.usef.org/learn/equine-health/equine-transport/interstate-travel", "secondary")
APHIS_NWS = S("USDA APHIS NWS animal movement guidance (Oct 2026)", "https://www.aphis.usda.gov/sites/default/files/nws-national-cob-movement-requirements.pdf", "official")
APHIS_ADT = S("USDA APHIS animal disease traceability FAQ", "https://www.aphis.usda.gov/sites/default/files/traceability-faq.pdf", "official")
TAHC = S("Texas Animal Health Commission: exhibition & event animals (May 29, 2025)", "https://web.tahc.texas.gov/regs/pdf/Exhibition_Event_Movement_Requirements.pdf", "official")
NDA = S("Nevada Dept. of Agriculture: import requirements", "https://agri.nv.gov/Animals/Animal_Disease/Import_Requirements/", "official")
MDA = S("Missouri Dept. of Agriculture: livestock movement (as of 7/10/26)", "https://agriculture.mo.gov/animals/rules.php", "official")
NMSU = S("NMSU Extension guide B-708: documents to transport horses in NM (Nov 2022)", "https://pubs.nmsu.edu/_b/B708/", "official")
AZCODE = S("Arizona Administrative Code R3-2-602 / R3-2-615", "https://regulations.justia.com/states/arizona/title-3/chapter-2/article-6/r3-2-615", "secondary")
GVL_OK = S("GlobalVetLink: Oklahoma equine travel requirements (July 2026)", "https://www.globalvetlink.com/blog/oklahoma-equine-travel-requirements", "secondary")
TAHC_NWS = S("Texas Animal Health Commission: New World Screwworm", "https://www.tahc.texas.gov/emergency/nws.html", "official")
OKDOC = S("Oklahoma Dept. of Agriculture: Health Requirements Governing the Admission of Animals (rev. 12/19/2025)", "https://ag.ok.gov/wp-content/uploads/2025/12/Animal-Import-Requirements.pdf", "official")
NMAC = S("New Mexico Administrative Code 21.32.4 (July 16, 2024)", "https://www.srca.nm.gov/parts/title21/21.032.0004.html", "official")
NMLB = S("New Mexico Livestock Board: import requirements", "https://www.nmlbonline.com/import", "official")
AZBEEF = S("Arizona Dept. of Agriculture: beef cattle entry requirements (Dec 2023)", "https://agriculture.az.gov/node/29", "secondary")
TAHC_ENTRY = S("Texas Animal Health Commission: entry requirements (read Nov 9, 2026)", "https://www.tahc.texas.gov/regs/entry.html", "official")
TAHC_NWS_ORDER = S("TAHC Executive Director Order: NWS requirements for animals from affected states (Oct 1, 2026)", "https://www.tahc.texas.gov/regs/pdf/2026-10-01_EDO-EntryRequirements-NWSAffectedStates.pdf", "official")
NDA_VS = S("Nevada Dept. of Agriculture: import requirements, VSV notice (read Nov 9, 2026)", "https://agri.nv.gov/Animals/Animal_Disease/Import_Requirements/", "official")
AZ_NWS = S("Arizona NWS infested zone (FOX 10 Phoenix, Oct 29, 2026) and AKC summary of Arizona entry rules", "https://www.fox10phoenix.com/news/arizona-livestock-owners-high-alert-after-new-world-screwworm-case-confirmed", "secondary")
TRJ = S("Team Roping Journal: EHV-1 protocols for Arizona and Vegas (Nov 28, 2025)", "https://teamropingjournal.com/news/ehv-1-protocols-everything-you-need-to-know-before-heading-to-arizona-and-vegas/", "secondary")

R = []
def rule(state, species, applies, kind, title, window, detail, src, sort=100, verified=None, **kw):
    R.append(dict(state=state, species=species, applies=applies, kind=kind, title=title, window_text=window, detail=detail, verified_on=verified or VERIFIED, sort=sort, **src, **kw))

# ---- Baseline (every route) ----
rule("US","horse","entering","required","Negative Coggins (EIA) test","Usually good for 6 to 12 months",
 "Nearly every state requires a negative Equine Infectious Anemia (Coggins) test for a horse entering from another state. The destination sets how recent it must be (12 months is common; some use 6). Keep the original or a copy with the horse. Many roping fliers also ask for it at the gate.", USEF, 10)
rule("US","horse","entering","required","Health certificate (CVI) from an accredited vet","Usually 30 days; shorter in outbreaks",
 "Issued after an exam by a USDA-accredited veterinarian. It lists the horse's description and ID and the Coggins date, lab and accession number. Some states accept an Extended Equine CVI (EECVI, up to 6 months with a current Coggins). Outbreak rules can shrink the window to 5 to 7 days.", USEF, 20)
rule("US","horse","entering","check","Proof of ownership or brand inspection","Varies by state",
 "Several Western states want proof of ownership (bill of sale or registration papers) and some require a brand inspection when livestock cross the line. Check the destination.", USEF, 30)
rule("US","cattle","entering","required","Interstate health certificate (ICVI)","Usually 30 days",
 "Cattle crossing state lines need an interstate certificate of veterinary inspection from an accredited vet, unless both states agree on another document.", APHIS_ADT, 10)
rule("US","cattle","entering","required","Official ID on every roping steer","Any age",
 "Under the federal traceability rule, cattle of any age used for rodeo or recreational events must be officially identified to cross state lines. Official ear tags must be readable visually and electronically (rule effective Nov 5, 2024). Brands or tattoos count only if both states agree. The ID numbers go on the ICVI.", APHIS_ADT, 20)
rule("US","both","transit","check","Just driving through?","Stay on the trailer",
 "Most states don't ask for paperwork if the animals never unload. For screwworm, USDA exempts travel through an infested zone that takes under 24 hours with no stop. If the horse unloads or stays overnight, that state's entry rules can apply. In Nov 2025, Arizona required its own health certificate for horses that unloaded there on the way to Nevada.", APHIS_NWS, 10)
# ---- Screwworm leaving a zone (TX, NM) ----
NWS_COMMON = ("An infested zone is roughly a 12-mile radius around a confirmed case. If your animal is inside one, it needs an NWS animal movement certificate attached to the CVI: inspection by an accredited vet within 5 days, a validated premises ID, animal ID, treatment if there are open wounds, and the paperwork sent to the origin and destination state offices at least 48 hours before you move. "
              "Not in a zone? The federal guidance sets no screwworm certificate, but the destination state may add rules.")
for sp in ("horse","cattle"):
    rule("TX",sp,"leaving","conditional","Screwworm movement certificate (only if the animal is in an infested zone)","Inspect within 5 days; certificate valid 5 days; file 48 hours ahead",
         NWS_COMMON + " Texas orders also require the Animal Health Commission's prior authorization before animals leave an infested zone (see the TAHC page).", TAHC_NWS, 5)
    rule("NM",sp,"leaving","conditional","Screwworm pre-movement inspection (only if the animal is in or leaving an infested zone)","Check with the Livestock Board before moving",
         "The New Mexico Livestock Board says special pre-movement inspections are required for warm-blooded animals moving within or leaving infested zones, and only a New Mexico accredited veterinarian can perform them. " + NWS_COMMON, NMLB, 5)
# ---- Texas ----
rule("TX","horse","entering","required","Negative Coggins (EIA) test","Within the past 12 months","Foals under 8 months with a negative dam are exempt. An equine passport allows a 6-month movement window if an EIA test issued in the past 6 months accompanies it.", TAHC, 10)
rule("TX","horse","entering","required","Electronic health certificate (eCVI) or Equine Interstate Passport","Valid 30 days, one movement","Since Jan 1, 2026 every CVI for animals entering Texas must be electronic (an eCVI from your vet's system, not a paper form). Horses from a state with vesicular stomatitis must have a CVI issued within 14 days before entry, with the VS status of the premises or area written on it. No Texas entry permit is required for horses, except Texas horses returning from a screwworm zone (see below).", TAHC_ENTRY, 20, verified=V2)
rule("TX","cattle","entering","required","Electronic health certificate (eCVI)","Valid 30 days","Since Jan 1, 2026 every CVI for animals entering Texas must be electronic. Cattle from a state with vesicular stomatitis need a CVI issued within 14 days before entry, with the VS status recorded on it.", TAHC_ENTRY, 10, verified=V2)
rule("TX","cattle","entering","required","Official ID","All cattle used for rodeo or events","Required for interstate movement regardless of age or breed.", TAHC, 20)
rule("TX","cattle","entering","required","TB test and entry permit for \"M\"-branded steers","Negative TB test within 12 months before the event","Texas treats \"M\"-branded steers as likely rodeo or roping stock. Out-of-state ones also need an entry permit before entering. Entry permits are valid 15 days; call the TAHC at 512-719-0777 or email permits@tahc.texas.gov.", TAHC, 30)
NWS_TX_ENTRY = ("Texas set new screwworm entry rules on Oct 1, 2026 for livestock coming from a state where screwworm has been found and a zone or quarantine is still active (New Mexico qualifies; Arizona had its first case Oct 28, so confirm with TAHC whether it is on the list). On top of the usual Texas rules: "
                "if the animal did NOT come from inside an infested zone, the eCVI must be issued within 30 days and state it did not originate in an infested zone, was inspected, and is free of screwworm and wounds. "
                "If it DID come from inside an infested zone, the eCVI must be issued within 7 days, document the screwworm inspection and any treatment, and state the animal originated in an infested zone, was inspected and is free of infestation and wounds (list the origin state's inspection document number if there is one). TAHC permits help desk: 512-719-0777, permits@tahc.texas.gov.")
for sp in ("horse","cattle"):
    rule("TX",sp,"entering","conditional","Screwworm statement on the eCVI (animals coming from a screwworm state such as New Mexico)","30 days normally; 7 days if from inside an infested zone", NWS_TX_ENTRY, TAHC_NWS_ORDER, 4, verified=V2)
    rule("TX",sp,"entering","conditional","Texas animal coming home from a screwworm zone in another state","Original Texas CVI must be 30 days old or less; entry permit before you cross",
         "A Texas horse or steer that went out of state into an infested zone can come back on the original Texas CVI if it was issued within 30 days before re-entry. It must carry documentation of the screwworm inspection (and any treatment) done while it was in the zone, and you must get a Texas entry permit before entering, referencing the original CVI number with the same animal ID. If the CVI is older than 30 days you need a new eCVI that meets the infested-zone rules (7 days, screwworm inspection statement).", TAHC_NWS_ORDER, 6, verified=V2)

# ---- Nevada ----
rule("NV","horse","entering","required","Health certificate (CVI)","Valid 30 days from issue","Required for horses entering Nevada. Nevada's temporary 2025 EHV rules (a 7-day certificate) were reported to end Jan 1, 2026; confirm no new rule applies to your event.", NDA, 10)
rule("NV","horse","entering","required","Negative Coggins (ELISA or AGID)","Within 12 months before entry","Nursing foals under 6 months with a negative dam are exempt.", NDA, 20)
rule("NV","horse","entering","check","Nevada entry permit for horses (was temporary; not on Nevada's current horse list)","Confirm before you go","Nevada's 2025 event-season rules required an entry permit for horses until Jan 1, 2026. Nevada's import page now lists only a CVI, a negative Coggins and proof of ownership for horses. Nevada's permit office (775-353-3709, entrypermits@agri.nv.gov) can confirm whether your event needs anything more; the permit system itself is still used for cattle.", NDA_VS, 30, verified=V2)
rule("NV","horse","entering","required","Proof of ownership","Carry with the horse","A brand inspection certificate, bill of sale or registration papers.", NDA, 40)
rule("NV","horse","entering","conditional","Vesicular stomatitis statement (animals from a state with quarantined VS premises)","Exam within 7 days of shipping; no exposure in the prior 14 days","New on Nevada's page (dated 10/29/2026; a heading on the same page says 11/29/2026, so confirm the start date with the permit office). When a state has VS-quarantined premises, the CVI must say: \"I have examined all the animals identified on this certificate within seven (7) days of shipment date and have found them to be free from signs of Vesicular Stomatitis Virus (VSV). During the last fourteen (14) days, these animals have not exposed to VSV nor located on a VSV confirmed or a VSV suspected premises.\" As of USDA\'s Nov 2 report only Colorado (Delta and Mesa counties) had premises under quarantine; Arizona and New Mexico premises have all been released.", NDA_VS, 50, verified=V2)
rule("NV","cattle","entering","required","Health certificate (CVI) and official ID","Valid 30 days","Official ID is required for rodeo, show or exhibition cattle and must be recorded on the CVI.", NDA, 10)
rule("NV","cattle","entering","required","Nevada entry permit number","Before shipping","Fax or email the CVI to the permit office first, then submit the details in Nevada's new online entry permit system (open 24/7) to get the permit number. If you hear nothing in 24 hours on a business day, call 775-353-3709.", NDA_VS, 20, verified=V2)
rule("NV","cattle","entering","conditional","TB test and brucellosis vaccination (only for sexually intact cattle)","TB test within 12 months before entry","Sexually intact event cattle 12 months or older need a TB test within 12 months before entry, and intact females 12 months or older must be official calfhood vaccinates (ear tattoo and ear tag) with \"These cattle are OCV'd\" on the CVI; adult vaccinates are not accepted. Castrated roping steers are not covered by these two; heifers and bulls are. Cattle from Idaho, Wyoming or Montana have extra brucellosis statements, and intact animals from a designated surveillance area need a negative brucellosis test within 30 days.", NDA_VS, 25, verified=V2)
rule("NV","cattle","entering","conditional","Vesicular stomatitis statement (animals from a state with quarantined VS premises)","Exam within 7 days; no exposure in the prior 14 days","Same VS statement as horses (see above); Nevada's notice applies to CVIs generally.", NDA_VS, 30, verified=V2)
# ---- Missouri ----
rule("MO","horse","entering","required","Health certificate (CVI)","Within 30 days before entry","Missouri accepts eCVI formats from GlobalVetLink, VetCVI, Vet Sentry and VSPS. The USDA 7001 form is not accepted. Missouri's page doesn't list a Coggins rule or a horse permit; earlier notices asked for a current negative Coggins, so carry one and call 573-751-3377 to confirm.", MDA, 10)
rule("MO","horse","entering","conditional","Screwworm rules (horses from states with an infested zone)","CVI within 14 days; within 5 days from an adjacent zone","From a state with an infested zone but not in or next to one: CVI within 14 days stating \"All animals were inspected and found free of evidence of NWS infestation.\" From a surveillance zone next to an infested zone: CVI within 5 days with the same statement. From inside an infested zone: the origin state's requirements, a Missouri entry permit and the NWS statement. Paper CVIs also need an MDA permit.", MDA, 20)
rule("MO","cattle","entering","required","Health certificate (CVI)","Within 30 days before entry","Shorter windows (5 or 14 days) apply to animals from screwworm states or zones. See the screwworm note under horses.", MDA, 10)
rule("MO","cattle","entering","required","Missouri entry permit for all rodeo and roping cattle","Valid 15 days","Missouri requires a permit for all rodeo stock. Official ID is also required; Missouri's separate tagging document has the details. The online permit system was being replaced in June 2026, so call 573-751-3377.", MDA, 20)
# ---- New Mexico ----
rule("NM","horse","entering","required","Official health certificate (CVI)","Normally valid 30 days","Must state the animals show no symptoms of infectious or contagious disease, and carry the horse's identification or description.", NMAC, 10)
rule("NM","horse","entering","required","Negative Coggins (EIA) test","Within 12 months before entry","AGID (Coggins) or CELISA at a USDA-approved lab. The test date, lab and result must be on the CVI. Nursing foals with a negative dam are exempt. A pending test needs a special permit from the state veterinarian, requested before entry.", NMAC, 20)
rule("NM","horse","entering","required","New Mexico entry permit","Get it before you leave","The Livestock Board says horses, mules, asses, cattle and bison entering from another state need an entry permit. Create it online (NM Entry Permits) or call 800-432-6889 with your NAN ready. Other questions: 505-841-6161.", NMLB, 30)
rule("NM","horse","entering","check","Proof of ownership and brand inspection","Carry bill of sale or papers","NMSU's guide says moving a horse between New Mexico brand districts needs a brand inspection form dated within 7 days or a hauling permit, and horses staying in New Mexico over 30 days need an inspection. The Livestock Board's import page doesn't list a brand inspection for entry; confirm what applies to your trip.", NMSU, 40)
rule("NM","cattle","entering","required","Health certificate and New Mexico entry permit","Before the cattle ship","Every cattle shipment needs a health certificate from the state of origin and a New Mexico entry permit (online or 800-432-6889). Tell a Livestock Board inspector when you arrive, before the cattle mix with others or go to pasture. Steers need no brucellosis test. The federal rule still requires official ID on rodeo and roping cattle.", NMAC, 10)
# ---- Arizona (cattle, secondary) ----
rule("AZ","cattle","entering","required","Arizona entry permit number and health certificate (CVI)","Permit number usable 30 days; CVI within 30 days","Get the permit number by calling 602-542-4293 (Mon to Fri, 8 to 5 Arizona time). The CVI comes from an accredited veterinarian, and every official ID number must be on it or attached. Rodeo and exhibition cattle of any age need official ID. Brand inspection requirements remain in effect.", AZBEEF, 10)
rule("AZ","cattle","entering","conditional","Vesicular stomatitis rule (cattle from an affected state)","CVI valid no more than 14 days","If the origin state has had a VS outbreak in the past 60 days, the CVI is valid for no more than 14 days and must say the animals were inspected and found free of VS signs.", AZBEEF, 20)
AZ_NWS_ENTRY = ("Arizona\'s first screwworm case was confirmed Oct 28, 2026 in Cochise County, and an infested zone with movement controls was set up there. For animals coming INTO Arizona from an infested zone (for example southern New Mexico or West Texas), secondary sources say Arizona wants a pre-movement inspection certificate, an interstate CVI and an Arizona entry permit number (effective June 11, 2026). Arizona\'s own pages were blocked to our research, so call Animal Services at 602-542-4293 before you haul.")
for sp in ("horse","cattle"):
    rule("AZ",sp,"entering","conditional","Screwworm paperwork (animals coming from an infested zone)","Before you cross", AZ_NWS_ENTRY, AZ_NWS, 5, verified=V2)
    rule("AZ",sp,"leaving","conditional","Screwworm movement permit (only if the animal is in or leaving the Cochise County zone)","Check with Arizona officials first",
         "Officials say movement within the Cochise County infested zone needs permits, and animals must be examined by a livestock inspector or veterinarian and may be treated before they move. Other states\' entry rules for animals from an infested zone will apply on the other end. Call 602-542-4293 to ask before you load.", AZ_NWS, 5, verified=V2)
# ---- Oklahoma ----
rule("OK","horse","entering","required","Health certificate (CVI)","Received within 30 days of entry","The CVI shows the negative Coggins result, test date, lab and accession number. One destination state per CVI. An approved current Extended Equine CVI (EECVI) also serves as the CVI.", OKDOC, 10)
rule("OK","horse","entering","required","Negative Coggins (EIA) test","Within 12 months","The original or a photocopy of the Coggins must travel with the horse. Foals under 6 months with a negative dam are exempt. Racing Quarter Horses, Paints and Appaloosas entering a racetrack also need a negative piroplasmosis test.", OKDOC, 20)
rule("OK","cattle","entering","required","Oklahoma import permit, CVI and official ID for roping and timed-event cattle","Negative TB test within 365 days before entry","Oklahoma lists roping and timed-event cattle (steers, heifers and bulls used for roping, plus tie-down calves) as event cattle: permit + CVI + individual official USDA ear tag + negative TB test within 365 days. Tie-down calves need only the ear tag. A permit is not needed if you use an electronic CVI that lists all the requirements. Permit and cattle questions: 405-522-6141 or 405-522-6128. (Four Michigan counties have a 60-day TB rule.)", OKDOC, 10)

ALERTS = [
 dict(kind="nws", verified=V2, title="New World screwworm: Texas, New Mexico and now Arizona have infested zones", states=["TX","NM","AZ"],
  body="Texas (TAHC, Nov 9): movement restrictions cover parts of 21 counties, 22 counties have had a detection and 69 premises in all; the first case was a Zavala County calf on June 3, and several zones have been released while others were modified in early November. New Mexico: much of the south is an infested zone after cases in Grant County (including horses) and Otero County in September and October. Arizona: first case Oct 28, a dog in Cochise County, with an infested zone and permits for movement. Animals inside a zone need extra paperwork to leave, and Texas now requires a screwworm statement on the eCVI for animals coming from affected states (Oct 1 order). Check the current zone map before you haul.",
  source_name="Texas Animal Health Commission: New World Screwworm (read Nov 9, 2026)", source_url="https://www.tahc.texas.gov/emergency/nws.html"),
 dict(kind="vs", verified=V2, title="Vesicular stomatitis: now only Colorado has premises under quarantine", states=["AZ","CO","NM","NV","TX","MO"],
  body="USDA's Nov 2, 2026 report counts 51 affected premises since the outbreak began in October 2025 (Arizona 15, Colorado 20, New Mexico 16), nearly all horses. Every Arizona and New Mexico premises has been released; the only two still under quarantine are in Colorado (Delta and Mesa counties; Mesa was new Oct 30). Nevada added a VS statement requirement for animals from states with quarantined premises, and Texas and Missouri have similar rules, so a haul out of Colorado is the one to check.",
  source_name="USDA APHIS VS situation report (Nov 2, 2026)", source_url="https://www.aphis.usda.gov/sites/default/files/vsv-sitrep-11-02-26.pdf"),
 dict(kind="ehv", title="EHV-1: emergency rules from 2025 mostly ended, but event vets still advise precautions", states=["AZ","NV","TX","OK","NM"],
  body="An outbreak that began at a Texas event in November 2025 spread to at least eight states and led to short-lived state rules (Arizona: a 5-day certificate; Nevada: a 7-day certificate, reported to end Jan 1, 2026). No new 2026 outbreak was confirmed, but check with the event and state before you go. Common event advice: vaccinate for EHV-1/4 and influenza, take temperatures twice a day, and report anything above 101.5 F to a vet.",
  source_name="Team Roping Journal (Nov 28, 2025)", source_url="https://teamropingjournal.com/news/ehv-1-protocols-everything-you-need-to-know-before-heading-to-arizona-and-vegas/"),
]

# replace everything
for t in ("travel_rules","travel_alerts","travel_states"):
    call("DELETE", f"/rest/v1/{t}?{'id' if t!='travel_states' else 'code'}=not.is.null")
call("POST", "/rest/v1/travel_states", [dict(code=c, name=n, office_name=(OFFICES.get(c) or [None]*4)[0], office_url=(OFFICES.get(c) or [None]*4)[1], office_phone=(OFFICES.get(c) or [None]*4)[2], office_email=(OFFICES.get(c) or [None]*4)[3]) for c, n in STATES.items()])
call("POST", "/rest/v1/travel_rules", R)
call("POST", "/rest/v1/travel_alerts", [dict({k: v for k, v in a.items() if k != "verified"}, verified_on=a.get("verified", VERIFIED)) for a in ALERTS])
print(f"seeded {len(STATES)} states, {len(R)} rules, {len(ALERTS)} alerts (default verified {VERIFIED}, updated rules {V2})")
