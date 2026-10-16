# Updating the Food Systems Map

The map and the survey dashboard read the stakeholder Google Sheet directly. When you edit the sheet,
the website shows the change within about **5–10 minutes**. No developer is needed.

- Map: https://lacofsfoodsystemmap.lross.workers.dev
- Data check: https://lacofsfoodsystemmap.lross.workers.dev/data-check (lists anything missing or wrong, by row number)

For the website to find the organizations, three things must stay as they are:

- the sheet stays published (File → Share → Publish to web),
- the organizations stay on the first tab of the spreadsheet,
- the **Organization Name** column keeps that name.

When the website can't read the sheet, it shows a saved copy instead, and the data check page says so.

## The columns the map uses

Put each piece of information in its own column, and use the columns that are already there. Organizations
from Kumu go in the same columns as everyone else; don't add a second name or address column.

| Column | What to put in it |
| --- | --- |
| Organization Name | The organization's name (required). |
| Sector | One of the sectors listed below. |
| Main Org Street Address (headquarters) | Street address. For places outside Los Angeles, include the city, e.g. `889 Guadalupe Rd, Arroyo Grande, CA`. |
| Main Org Zip Code | Zip code. |
| lat and lng | Map coordinates. Optional, but needed for farms and for any address the map can't find on its own. |
| Website | The website, e.g. `www.example.org`. |
| Activity | What the organization does, e.g. its Kumu Service Category. |

Column headings may differ slightly. For example, "Latitude" and "Longitude", "Contact (website address from
Kumu)" and "Activity (Kumu Service Category)" all work. If the sheet has no Website or Activity column yet, add
one at the right-hand end of the sheet. The survey questions, Timestamp and Email columns are
filled in by the Google Form. Leave them blank for organizations you add by hand: rows without a Timestamp
appear on the map but aren't counted as survey responses on the dashboard.

## Sectors

The dot colors on the map and the Sector Legend use exactly these sectors, in this order:

Nonprofit/CBO · For-Profit · Government Agency · K-12 School/School District · College/University · Labor ·
Farm · Foundation · Other

Small differences in capitals or punctuation are fine ("nonprofit" counts as Nonprofit/CBO). Anything else,
including a write-in answer from the form's "Other:" option, is shown as Other and listed on the data check
page so you can fix it.

## Adding a farm or an organization from Kumu

1. Add a new row at the bottom of the sheet.
2. Fill in Organization Name, Sector, the address and zip code, and the Website and Activity if you have them.
3. For a farm, or anything outside Los Angeles, also fill in **lat** and **lng** (see below).
4. After about 10 minutes, check the data check page.

## Finding lat and lng

1. Find the place on Google Maps (the data check page has a "Find on Google Maps" link for each organization
   that is missing a location).
2. Right-click the spot. The first line of the menu shows two numbers, like `34.05223, -118.24368`. Click them
   to copy them.
3. In the sheet, paste the first number into **lat** and the second into **lng**. In Los Angeles, lat is about
   34 and lng is about -118 (with the minus sign).

Coordinates typed into the sheet always win over the automatic address lookup, so you can also use them to
move a dot that is in the wrong place.

## The data check page

https://lacofsfoodsystemmap.lross.workers.dev/data-check shows how many rows the sheet has, how many
organizations are on the map, and what needs attention:

- **Missing a location**: no lat/lng and no address the map could find. Each row says why.
- **Coordinate problems**: a lat or lng value that doesn't look right.
- **Duplicates**: the same name on more than one row. The map shows the organization once, using its most
  recent survey answer. Nothing to do unless they are different organizations.
- **Possible duplicates**: names that look alike. If they are the same organization, give both rows exactly
  the same name.
- **Sector not in the list** and **Blank sector**: shown as Other until fixed.
- **Missing columns**: a column the map looks for but can't find.

The page isn't linked from the website and is hidden from search engines. Bookmark it.

## The nightly refresh

Every night at about 3 am, an automatic job on GitHub:

- looks up a map location for each new address (each address is tried once; if it can't be found, the data
  check page says so and you can add lat/lng instead),
- saves a copy of the sheet inside the website, used whenever Google Sheets can't be reached,
- updates the website if anything changed.

New addresses therefore appear on the map the morning after you add them, or within minutes if you fill in
lat and lng. To run the refresh now: on GitHub, open the **FoodSystemMap** repository → **Actions** → **Refresh
map data** → **Run workflow** → **Run workflow**. It takes a few minutes, and the website updates a few minutes
after that.

A run that fails shows a red ✗ on the Actions page. The website keeps working either way, and the next night's
run tries again. GitHub may pause the nightly refresh when the repository has had no activity for 60 days: if
the Actions page says the workflow is disabled, click **Enable workflow**.

## Changing sector colors

The colors and the legend order are in the file `src/lib/sectors.js`. On GitHub, open that file, click the
pencil icon (Edit), change a color code such as `#2F855A` (any hex color works), and click **Commit changes**.
The website updates by itself within a few minutes. Adding or renaming a sector also means changing the sheet
and the form, so ask a developer for that.
