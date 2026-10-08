#!/usr/bin/env python3
"""Seeds/refreshes the travel checker data (states, rules, alerts). Re-runnable: replaces ALL rows in the three tables.
Run from steer-me-app/:  python3 supabase/seed-data/travel_checker_seed.py
Every rule needs a source and a verified date. Edit this file, bump VERIFIED, re-run. Rules were researched 2026-10-08;
see DOCS/vet-documents-research-and-coggins-strategy.md. Rule wording is a GUIDE, not legal advice."""
import json, os, urllib.request, urllib.error
VERIFIED = "2026-10-08"
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
 "NM": ("New Mexico Livestock Board", "https://www.nmlbonline.com/", "505-841-6161", None),
 "AZ": ("Arizona Dept. of Agriculture, Animal Services", "https://agriculture.az.gov/", "602-542-4293", None),
 "OK": ("Oklahoma Dept. of Agriculture, Food and Forestry", "https://ag.ok.gov/divisions/animal-industry-state-veterinarian/", None, None),
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
TRJ = S("Team Roping Journal: EHV-1 protocols for Arizona and Vegas (Nov 28, 2025)", "https://teamropingjournal.com/news/ehv-1-protocols-everything-you-need-to-know-before-heading-to-arizona-and-vegas/", "secondary")

R = []
def rule(state, species, applies, kind, title, window, detail, src, sort=100, **kw):
    R.append(dict(state=state, species=species, applies=applies, kind=kind, title=title, window_text=window, detail=detail, verified_on=VERIFIED, sort=sort, **src, **kw))

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
    rule("NM",sp,"leaving","conditional","Screwworm movement certificate (only if the animal is in an infested zone)","Inspect within 5 days; certificate valid 5 days; file 48 hours ahead",
         NWS_COMMON + " Check New Mexico's current zone and rules with the Livestock Board.", APHIS_NWS, 5)
# ---- Texas ----
rule("TX","horse","entering","required","Negative Coggins (EIA) test","Within the past 12 months","Foals under 8 months with a negative dam are exempt. An equine passport allows a 6-month movement window if an EIA test issued in the past 6 months accompanies it.", TAHC, 10)
rule("TX","horse","entering","required","Health certificate (CVI) or Equine Interstate Passport","Valid 30 days, one movement","Horses from a state with vesicular stomatitis must have a CVI issued within 14 days before entry, with the VS status of the premises or area written on it. No Texas entry permit is required for horses.", TAHC, 20)
rule("TX","cattle","entering","required","Health certificate (CVI)","Valid 30 days","Cattle from a state with vesicular stomatitis need a CVI issued within 14 days before entry, with the VS status recorded on it.", TAHC, 10)
rule("TX","cattle","entering","required","Official ID","All cattle used for rodeo or events","Required for interstate movement regardless of age or breed.", TAHC, 20)
rule("TX","cattle","entering","required","TB test and entry permit for \"M\"-branded steers","Negative TB test within 12 months before the event","Texas treats \"M\"-branded steers as likely rodeo or roping stock. Out-of-state ones also need an entry permit before entering. Entry permits are valid 15 days; call the TAHC at 512-719-0777 or email permits@tahc.texas.gov.", TAHC, 30)
# ---- Nevada ----
rule("NV","horse","entering","required","Health certificate (CVI)","Valid 30 days from issue","Required for horses entering Nevada. Nevada's temporary 2025 EHV rules (a 7-day certificate) were reported to end Jan 1, 2026; confirm no new rule applies to your event.", NDA, 10)
rule("NV","horse","entering","required","Negative Coggins (ELISA or AGID)","Within 12 months before entry","Nursing foals under 6 months with a negative dam are exempt.", NDA, 20)
rule("NV","horse","entering","required","Nevada entry permit number","Get it after your vet submits the CVI","Obtained through the Nevada Department of Agriculture's online entry permit system once the CVI is reviewed. The number goes on the CVI. Permit office: 775-353-3709, entrypermits@agri.nv.gov.", NDA, 30)
rule("NV","horse","entering","required","Proof of ownership","Carry with the horse","A brand inspection certificate, bill of sale or registration papers.", NDA, 40)
rule("NV","horse","entering","conditional","Vesicular stomatitis statement (horses from affected states)","Exam within 7 days of shipping; no exposure in the prior 14 days","If the horse is from a state with diagnosed VS (the page listed New Mexico and Colorado as of 6/2/2026), or visited one and is returning, the CVI needs a VS statement.", NDA, 50)
rule("NV","cattle","entering","required","Health certificate (CVI) and official ID","Valid 30 days","Official ID is required for rodeo, show or exhibition cattle and must be recorded on the CVI.", NDA, 10)
rule("NV","cattle","entering","required","Nevada entry permit number","Before shipping","Required for cattle. Brucellosis or TB tests may apply by class (generally within 30 days of entry). Call the permit office at 775-353-3709.", NDA, 20)
rule("NV","cattle","entering","conditional","Vesicular stomatitis statement (cattle from affected states)","Exam within 7 days; no exposure in the prior 14 days","Same VS rule as horses.", NDA, 30)
# ---- Missouri ----
rule("MO","horse","entering","required","Health certificate (CVI)","Within 30 days before entry","Missouri accepts eCVI formats from GlobalVetLink, VetCVI, Vet Sentry and VSPS. The USDA 7001 form is not accepted. Missouri's page doesn't list a Coggins rule or a horse permit; earlier notices asked for a current negative Coggins, so carry one and call 573-751-3377 to confirm.", MDA, 10)
rule("MO","horse","entering","conditional","Screwworm rules (horses from states with an infested zone)","CVI within 14 days; within 5 days from an adjacent zone","From a state with an infested zone but not in or next to one: CVI within 14 days stating \"All animals were inspected and found free of evidence of NWS infestation.\" From a surveillance zone next to an infested zone: CVI within 5 days with the same statement. From inside an infested zone: the origin state's requirements, a Missouri entry permit and the NWS statement. Paper CVIs also need an MDA permit.", MDA, 20)
rule("MO","cattle","entering","required","Health certificate (CVI)","Within 30 days before entry","Shorter windows (5 or 14 days) apply to animals from screwworm states or zones. See the screwworm note under horses.", MDA, 10)
rule("MO","cattle","entering","required","Missouri entry permit for all rodeo and roping cattle","Valid 15 days","Missouri requires a permit for all rodeo stock. Official ID is also required; Missouri's separate tagging document has the details. The online permit system was being replaced in June 2026, so call 573-751-3377.", MDA, 20)
# ---- New Mexico ----
rule("NM","horse","entering","required","Health certificate (CVI)","Normally valid 30 days","A CVI is required when you cross the New Mexico line.", NMSU, 10)
rule("NM","horse","entering","required","Negative Coggins (EIA) test","Normally 12 months","Required to cross the state line and for entry to some exhibitions, shows and rodeos.", NMSU, 20)
rule("NM","horse","entering","check","Proof of ownership and brand inspection","Carry bill of sale or papers","Moving a horse between New Mexico brand districts needs a brand inspection form dated within 7 days or a permanent hauling permit (Form 1-H), and the Livestock Board says livestock entering from another state need an inspection. Confirm what applies to your trip: 505-841-6161.", NMSU, 30)
rule("NM","horse","entering","conditional","Vesicular stomatitis statement on the CVI","Check current status","Livestock entering New Mexico have been required to carry a VS statement on the CVI, and animals from VS counties a Livestock Board permit. This comes from articles of uncertain date, so call the Livestock Board for the current rule.", S("Ebarrelracing summary of NM rules during VS","https://www.ebarrelracing.com/articles/?p=2390","secondary"), 40)
# ---- Arizona ----
rule("AZ","horse","entering","required","Official health certificate (CVI) from the state of origin","Check the age limit with Arizona","The CVI must identify the horse (age, sex, breed, color, name, markings) and give the negative EIA test date, the lab name and the accession number. Arizona's 2025 EHV rules asked for a 5-day-old certificate; confirm whether a shorter limit applies now: 602-542-4293.", AZCODE, 10)
rule("AZ","horse","entering","required","Negative Coggins (EIA) test","Within 12 months before entry","Applies to horses six months or older.", AZCODE, 20)
rule("AZ","horse","entering","required","Arizona entry permit","None needed for horses","Arizona's code says equines entering the state do not need an entry permit number.", AZCODE, 30)
rule("AZ","cattle","entering","check","Arizona cattle and rodeo-stock rules","Call before you haul","I could not confirm Arizona's rules for roping cattle from official pages. The federal baseline (ICVI and official ID) applies. Call the Arizona Department of Agriculture at 602-542-4293.", AZCODE, 10)
# ---- Oklahoma ----
rule("OK","horse","entering","required","Health certificate (CVI)","Issued within 30 days of entry","It must carry the horse's ID, the Coggins date, the lab and the accession number. An approved Extended Equine CVI (EECVI) with a valid Coggins also works, for up to 6 months.", GVL_OK, 10)
rule("OK","horse","entering","required","Negative Coggins (EIA) test","Within the previous 12 months","Carry the original or a photocopy with the horse. Foals under 6 months with a negative dam are exempt.", GVL_OK, 20)
rule("OK","cattle","entering","check","Oklahoma cattle and rodeo-stock rules","Call before you haul","I could not confirm Oklahoma's roping-cattle rules from official pages. The federal baseline (ICVI and official ID) applies. Check with the Oklahoma Department of Agriculture's state veterinarian.", GVL_OK, 10)

ALERTS = [
 dict(kind="nws", title="New World screwworm is in Texas and New Mexico", states=["TX","NM"],
  body="First US detection June 3, 2026. As of an Oct 5 Texas House briefing, 21 infested zones had been set up across 19 Texas counties, with 3 active cases nationwide. Horses have been affected (a West Texas ranch horse and a New Mexico horse in Grant County). Animals inside a zone need extra paperwork to leave; Texas has been releasing some zones. Check the current zone map before you haul.",
  source_name="Texas Animal Health Commission: New World Screwworm", source_url="https://www.tahc.texas.gov/emergency/nws.html"),
 dict(kind="vs", title="Vesicular stomatitis is active in Arizona, Colorado and New Mexico", states=["AZ","CO","NM","NV","TX","MO"],
  body="USDA counted 47 affected premises as of Sept 14, 2026, mostly horses. Several states ask for a VS statement on the health certificate, a recent exam, or a permit for horses and cattle from affected states (Nevada, Texas and Missouri among them).",
  source_name="USDA APHIS VS situation report (Sept 18, 2026)", source_url="https://www.aphis.usda.gov/sites/default/files/vsv-sitrep-9-18-26.pdf"),
 dict(kind="ehv", title="EHV-1: emergency rules from 2025 mostly ended, but event vets still advise precautions", states=["AZ","NV","TX","OK","NM"],
  body="An outbreak that began at a Texas event in November 2025 spread to at least eight states and led to short-lived state rules (Arizona: a 5-day certificate; Nevada: a 7-day certificate, reported to end Jan 1, 2026). No new 2026 outbreak was confirmed, but check with the event and state before you go. Common event advice: vaccinate for EHV-1/4 and influenza, take temperatures twice a day, and report anything above 101.5 F to a vet.",
  source_name="Team Roping Journal (Nov 28, 2025)", source_url="https://teamropingjournal.com/news/ehv-1-protocols-everything-you-need-to-know-before-heading-to-arizona-and-vegas/"),
]

# replace everything
for t in ("travel_rules","travel_alerts","travel_states"):
    call("DELETE", f"/rest/v1/{t}?{'id' if t!='travel_states' else 'code'}=not.is.null")
call("POST", "/rest/v1/travel_states", [dict(code=c, name=n, office_name=(OFFICES.get(c) or [None]*4)[0], office_url=(OFFICES.get(c) or [None]*4)[1], office_phone=(OFFICES.get(c) or [None]*4)[2], office_email=(OFFICES.get(c) or [None]*4)[3]) for c, n in STATES.items()])
call("POST", "/rest/v1/travel_rules", R)
call("POST", "/rest/v1/travel_alerts", [dict(a, verified_on=VERIFIED) for a in ALERTS])
print(f"seeded {len(STATES)} states, {len(R)} rules, {len(ALERTS)} alerts (verified {VERIFIED})")
