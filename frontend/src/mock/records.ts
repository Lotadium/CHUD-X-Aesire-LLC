export type Organization = {
    organization_id: number;
    name: string;
    website_url: string | null;
    domain_name: string;
    date_last_updated: string;
  };
  
  export type Person = {
    person_id: number;
    first_name: string;
    last_name: string;
    positions: {
      position_id: number;
      organization_id: number;
      organization_name: string;
      title: string | null;
      phone: string | null;
    }[];
    emails: { email_id: number; address: string }[];
  };
  
  export const mockOrganizations: Organization[] = [
    { organization_id: 1, name: "Northside Fire & Rescue", website_url: "northsidefire.org", domain_name: "EMS", date_last_updated: "2026-10-12T17:00:00Z" },
    { organization_id: 2, name: "Cedar Valley Unified", website_url: "cedarvalleyusd.org", domain_name: "Education", date_last_updated: "2026-10-09T17:00:00Z" },
    { organization_id: 3, name: "City of Marlow", website_url: "cityofmarlow.gov", domain_name: "Public Works", date_last_updated: "2026-10-07T17:00:00Z" },
  ];
  
  export const mockPeople: Person[] = [
    {
      person_id: 1, first_name: "Dana", last_name: "Whitfield",
      positions: [{ position_id: 1, organization_id: 1, organization_name: "Northside Fire & Rescue", title: "Chief", phone: "(555) 010-0142" }],
      emails: [{ email_id: 1, address: "dwhitfield@northsidefire.org" }],
    },
    {
      person_id: 2, first_name: "Priya", last_name: "Raman",
      positions: [{ position_id: 2, organization_id: 2, organization_name: "Cedar Valley Unified", title: "Superintendent", phone: "(555) 010-0119" }],
      emails: [{ email_id: 2, address: "praman@cedarvalleyusd.org" }],
    },
  ];