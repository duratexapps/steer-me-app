-- Contact info for the first layover spots (2026-10-21). The point of the tool is one place with a location and a way
-- to reach each stop, so every stop now carries an address or directions, and a phone or website where a public
-- listing gave one. Numbers come from the same public listings named in source_name/source_url (a few from a
-- directory or a 2023 guide, noted on the row), and none has been called. Also corrects facts found while looking:
-- WestWorld (official city page), Weeping Willow (stalls, not paddocks), Cuervo Mountain (location), Kiva (stables).

update public.layover_spots set address = 'Huson, MT. From the I-90 exit turn right, then left onto the Frontage Road; under a mile from the exit.',
  website = 'http://www.horsehavenmt.org', notes = coalesce(notes || ' ', '') || 'No phone found in public listings: use the website.'
  where name = 'Horse Haven Montana';
update public.layover_spots set address = '12960 Medicine Man Trail, Molt, MT 59057',
  website = 'https://visityellowstonecountry.com/listing/v-lazy-b-bed-breakfast-and-horse-motel',
  notes = 'Near Molt, west of Billings. Stall or pen type not stated in the listing: ask. No phone found; the listing has an email contact option.'
  where name = 'V Lazy B Bed & Breakfast and Horse Motel';
update public.layover_spots set address = '2865 Targhee Pass Highway, West Yellowstone, MT 59758', phone = '406-640-3020',
  notes = 'A detour from the I-15 / I-90 corridor: West Yellowstone is not on the interstate. 406-640-3020 is a directory number for the ranch''s horse boarding; the ranch''s general number is 406-646-0606.'
  where name = 'Horse Motel at The Diamond P Ranch';
update public.layover_spots set address = '390 Wooton Way, Blackfoot, ID 83221',
  notes = 'Phone number comes from one listing: confirm. Max stay listed as 14 nights.'
  where name like 'Fairway RV Park%';
update public.layover_spots set address = '475 South Main St, Spanish Fork, UT' where name = 'Spanish Fork Fairgrounds';
update public.layover_spots set address = '2966 W Pioneer Rd, Marriott-Slaterville, UT 84404', phone = '425-221-6863', website = 'https://wasatchviewranch.com',
  housing_detail = 'Horse boarding ranch: covered stalls for overnight guests, plus an outdoor paddock for long-term self-service boarding.',
  has_stalls = true,
  notes = 'About 1.25 miles west of I-15 near Ogden. Contact details come from an equine directory: confirm.'
  where name = 'Wasatch View Ranch';
update public.layover_spots set address = '5800 E Flamingo Rd, Las Vegas, NV 89122', phone = '702-455-8206',
  housing_detail = 'Eight barns of 40 stalls each (320 stalls), plus corrals, livestock pens and wash racks.',
  notes = 'Just east of Nellis Boulevard. The county park listing does not say how an overnight traveler books a stall: ask.'
  where name = 'Horseman''s Park';
update public.layover_spots set address = '1301 W Whipple Ave, Logandale, NV 89021', phone = '702-298-7480',
  notes = 'From I-15 take exit 93, go south about 5 miles and turn left on Whipple; the fairgrounds are just past the elementary school.'
  where name like 'Logandale Horse Stalls%';
update public.layover_spots set address = '9315 E Blake Ranch Rd, Kingman, AZ 86401', phone = '928-757-3336',
  notes = 'About 12 miles east of Kingman, 0.2 mile from I-40 at exit 66 (Blake Ranch Road). Nightly rate reported at $52 to $60: confirm. A 2024 review mentioned nearby construction noise.'
  where name = 'Blake Ranch RV Park & Horse Motel';
update public.layover_spots set address = '1325 N Tegner St, Wickenburg, AZ 85390', phone = '928-231-3331', website = 'https://ranchorioaz.com',
  notes = 'Phone and website come from a 2023 Team Roping Journal guide (run by Yost Events): confirm. Locals without an RV reservation can rent stalls monthly. Listing last updated November 2024.'
  where name = 'Rancho Rio';
update public.layover_spots set address = '1125 N Tegner St, Wickenburg, AZ 85390', phone = '928-684-5271',
  notes = 'One listing gives 1145 N Tegner St instead: confirm the address when you call.'
  where name = 'Loose Horse RV Park';
update public.layover_spots set address = '51802 US Hwy 60/89, Wickenburg, AZ 85390', phone = '928-684-2519', website = 'https://horspitality.com',
  notes = 'Over half of guests do not bring horses. One directory describes it as a 55+ community while others describe an RV park open to all ages: ask if that matters to you.'
  where name = 'Horspitality RV Resort';
update public.layover_spots set address = '16601 N Pima Rd, Scottsdale, AZ 85260', phone = '480-312-6802', website = 'https://www.westworldaz.com/rv-and-camping',
  rv_detail = '398 permanent RV spaces in 8 lots, all with electric and water; dump station on site (non-guests $10). About $57 a night with tax; stay limit 14 days in any 30 (city page).',
  requirements = 'The city requires an RV reservation request first, through the online form on its RV page (westworldrv@scottsdaleaz.gov). Some events use separate RV booking.',
  notes = 'Reviewers report noise and dust and crowded access on event weekends. The 480-312-6802 number is the RV line.'
  where name = 'WestWorld of Scottsdale';
update public.layover_spots set address = '11300 S Houghton Rd, Tucson, AZ 85747' where name like 'Pima County Fairgrounds%';
update public.layover_spots set address = '400 W Center St, Douglas, WY 82633', phone = '307-358-2398',
  rv_detail = 'Electric, water and sewer hookups plus dry camping. Sources disagree on the number of camp spaces (about 460 to 600+). Reported $25 to $40 a night.',
  notes = 'A large dirt lot with hookups, per a reviewer. The phone number is the campground listing''s; the address is from a horse-show listing: confirm both.'
  where name = 'Wyoming State Fairgrounds';
update public.layover_spots set address = '3801 Archer Pkwy, Cheyenne, WY 82009', phone = '307-633-4670', website = 'https://laramiecountyevents.com',
  notes = 'Near I-80 and I-25. A separate RV park next door lists 20 water-and-electric and 40 electric-only sites. Stall details are from a 2024 Frontier Days article: confirm what is open when you travel.'
  where name = 'Laramie County Events';
update public.layover_spots set address = '2500 E Route 66 Blvd, Tucumcari, NM 88401', phone = '575-815-4085', website = 'https://blazeinsaddle.com',
  notes = 'Reached from I-40. A 2023 listing said the park was temporarily closed; 2025 reviews show guests staying: call to confirm.'
  where name = 'Blaze-in-Saddle RV Park';
update public.layover_spots set address = '21 Old Highway 60 W, Bernardo, NM 87006', phone = '505-861-0693', website = 'https://www.kivarvparkandhorsemotel.com',
  has_stalls = true, housing_detail = 'Horse motel with stables and an exercise area.',
  rv_detail = '35 sites with 30/50-amp full hookups. Laundry, showers, Wi-Fi, dog run.',
  notes = 'I-25 exit 175; the park is on the west side of the interstate, about 34 miles north of Socorro. Check-in noon, check-out 11 a.m.'
  where name = 'Kiva RV Park & Horse Motel';
update public.layover_spots set address = '16 Ella Dora Rd, Stanley, NM 87056', phone = '505-316-5070', website = 'https://www.cuervomountainrvpark.com',
  notes = 'About 3 minutes north of I-40 exit 196, near Moriarty and about 35 miles east of Albuquerque. The phone number comes from one directory listing: confirm.'
  where name = 'Cuervo Mountain RV Park and Horse Hotel';
update public.layover_spots set address = '7701 I-40 Access Rd, Amarillo, TX 79118', phone = '806-372-5000', website = 'https://www.bigtexan.com',
  requirements = 'Bring valid Coggins papers to the front desk and leave a small key deposit to use the free round pen.',
  notes = 'On I-40: unload, eat at the restaurant and get a motel room on the property. The phone is the motel front desk (staffed 24 hours).'
  where name = 'Big Texan Horse Motel';
update public.layover_spots set address = '10301 Luka Rd, Amarillo, TX 79118',
  notes = 'Several miles off the interstate, so mostly quiet. No phone found in public listings: look it up on the Campendium page.'
  where name = 'Crossroads RV Park and Horse Motel';
update public.layover_spots set address = '5680 TX-15, Stratford, TX 79084', phone = '806-366-7827', website = 'https://staroftexasrv.com',
  notes = 'In the Texas Panhandle, north of Amarillo.'
  where name = 'Star of Texas RV Park and Horse Hotel';
update public.layover_spots set
  notes = 'No street address or phone in public listings. Book and message the host through the Hipcamp listing; the host asks for your expected check-in time.'
  where name = 'Cowboy RV Park & Horse Hotel';
update public.layover_spots set
  notes = 'No address or phone found in public listings: check the Petworks listing. Rate listed as $25 a night plus tax for stalls and for hookups.'
  where name = 'SF Ranch Horse Motel';
update public.layover_spots set address = '695 E Stamford St, Abilene, TX 79601', phone = '325-704-5252',
  notes = 'Just off I-20. Site counts differ by source (98 to 115). Rates reported from about $40 to $55: confirm.'
  where name = 'Whistlestop RV Resort';
update public.layover_spots set address = '107 CR 376, Trent, TX 79561', phone = '325-669-7153',
  has_stalls = true, has_pens = false,
  housing_detail = 'Horse stalls, about $25 extra a night per two listings. One promotional listing says paddocks instead: ask what is available.',
  rv_detail = '20 pull-through sites with 50-amp full hookups.',
  notes = 'I-20 exit 263, between Sweetwater and Abilene. Rate reported around $30 to $35 a night.'
  where name = 'Weeping Willow RV Park';
update public.layover_spots set address = 'Near Cheyenne, WY (exact address given to Harvest Hosts members)' where name = 'Lazy E Ranch';
