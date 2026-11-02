// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
// Sample web search results for real California entities, one set per entity type, in the shape
// CHUD-29's search returns. They are written by hand to look like real results (the official site
// mixed in with Wikipedia, directories, news and social media); they were not recorded from Brave,
// so no test ever needs the real API.
import type { SearchResults } from "../../src/search/provider.ts";
import type { RankContext } from "../../src/ranking/rank.ts";

export type Sample = {
  type: string;
  entity: RankContext;
  results: SearchResults;
  /** The official website, or null when the search did not find it. */
  official: string | null;
  /** What the ranking should decide. */
  expect: "high" | "low";
};

const result = (url: string, title: string, description = "") => ({ url, title, description });

export const SAMPLES: Sample[] = [
  {
    type: "fire district",
    entity: { name: "Contra Costa County Fire Protection District", county: "Contra Costa" },
    official: "https://www.cccfpd.org/",
    expect: "high",
    results: [
      result("https://en.wikipedia.org/wiki/Contra_Costa_County_Fire_Protection_District", "Contra Costa County Fire Protection District - Wikipedia"),
      result("https://www.cccfpd.org/", "Contra Costa County Fire Protection District", "Serving the communities of Contra Costa County."),
      result("https://www.facebook.com/ContraCostaFire/", "Contra Costa County Fire Protection District | Facebook"),
      result("https://www.eastbaytimes.com/2026/08/14/contra-costa-fire-crews-contain-grass-fire/", "Contra Costa fire crews contain grass fire near Antioch"),
      result("https://www.yelp.com/biz/contra-costa-county-fire-protection-district-concord", "Contra Costa County Fire Protection District - Concord, CA - Yelp"),
    ],
  },
  {
    type: "water district",
    entity: { name: "East Bay Municipal Utility District", county: "Alameda" },
    official: "https://www.ebmud.com/",
    expect: "high",
    results: [
      result("https://www.ebmud.com/", "EBMUD | East Bay Municipal Utility District"),
      result("https://en.wikipedia.org/wiki/East_Bay_Municipal_Utility_District", "East Bay Municipal Utility District - Wikipedia"),
      result("https://www.linkedin.com/company/ebmud", "East Bay Municipal Utility District | LinkedIn"),
      result("https://www.sfchronicle.com/bayarea/article/ebmud-water-rates-2026.php", "EBMUD board approves new water rates"),
      result("https://www.bbb.org/us/ca/oakland/profile/water-utility/east-bay-municipal-utility-district", "East Bay Municipal Utility District | BBB Business Profile"),
    ],
  },
  {
    type: "city",
    entity: { name: "City of Sacramento", city: "Sacramento", county: "Sacramento" },
    official: "https://www.cityofsacramento.gov/",
    expect: "high",
    results: [
      result("https://www.cityofsacramento.gov/", "City of Sacramento"),
      result("https://www.saccounty.gov/", "Sacramento County"),
      result("https://www.visitsacramento.com/", "Visit Sacramento | Things to Do in Sacramento, CA"),
      result("https://www.sacbee.com/news/local/article123.html", "Sacramento City Council votes on budget"),
      result("https://en.wikipedia.org/wiki/Sacramento,_California", "Sacramento, California - Wikipedia"),
    ],
  },
  {
    type: "county agency",
    entity: { name: "Los Angeles County Department of Public Health", county: "Los Angeles" },
    official: "https://publichealth.lacounty.gov/",
    expect: "high",
    results: [
      result("https://lacounty.gov/", "Los Angeles County"),
      result("https://publichealth.lacounty.gov/", "Los Angeles County Department of Public Health"),
      result("https://en.wikipedia.org/wiki/Los_Angeles_County_Department_of_Public_Health", "Los Angeles County Department of Public Health - Wikipedia"),
      result("https://x.com/lapublichealth", "LA Public Health (@lapublichealth) / X"),
      result("https://www.latimes.com/california/story/2026-09-02/la-county-public-health-update", "L.A. County public health officials issue heat advisory"),
    ],
  },
  {
    type: "special district",
    entity: { name: "Bay Area Air Quality Management District", county: "Alameda" },
    official: "https://www.baaqmd.gov/",
    expect: "high",
    results: [
      result("https://www.baaqmd.gov/", "Bay Area Air Quality Management District"),
      result("https://en.wikipedia.org/wiki/Bay_Area_Air_Quality_Management_District", "Bay Area Air Quality Management District - Wikipedia"),
      result("https://www.facebook.com/BayAreaAirQuality", "Bay Area Air Quality Management District | Facebook"),
      result("https://www.mercurynews.com/2026/07/20/spare-the-air-alert/", "Spare the Air alert issued for Bay Area"),
    ],
  },
  {
    // The domain only half spells the name (ebparks = East Bay ... Park), so a person should confirm it.
    type: "special district, name not in the domain",
    entity: { name: "East Bay Regional Park District", county: "Alameda" },
    official: "https://www.ebparks.org/",
    expect: "low",
    results: [
      result("https://www.ebparks.org/", "East Bay Regional Park District"),
      result("https://en.wikipedia.org/wiki/East_Bay_Regional_Park_District", "East Bay Regional Park District - Wikipedia"),
      result("https://www.tripadvisor.com/Attraction_Review-East_Bay_Regional_Park_District", "East Bay Regional Park District - Tripadvisor"),
      result("https://www.instagram.com/ebparks/", "East Bay Regional Park District (@ebparks)"),
    ],
  },
  {
    // Only directories, news and social media came back: nothing should be saved.
    type: "water district, no official site in the results",
    entity: { name: "Contra Costa Water District", county: "Contra Costa" },
    official: null,
    expect: "low",
    results: [
      result("https://en.wikipedia.org/wiki/Contra_Costa_Water_District", "Contra Costa Water District - Wikipedia"),
      result("https://www.yelp.com/biz/contra-costa-water-district-concord", "Contra Costa Water District - Concord, CA - Yelp"),
      result("https://www.facebook.com/ContraCostaWater", "Contra Costa Water District | Facebook"),
      result("https://www.eastbaytimes.com/2026/05/01/contra-costa-water-district-drought/", "Contra Costa Water District declares drought stage"),
    ],
  },
];
