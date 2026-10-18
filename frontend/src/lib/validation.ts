import { z } from "zod"; //A Zod schema is a declarative way to describe what valid data should look like. Zod then uses this schema to validate incoming data and infer TypeScript types automatically, giving you type safety at compile time and reliable validation at runtime

// WEBSITE: true if the text is a real http/https web address
function isValidUrl(v: string): boolean {
  try {
    const url = new URL(v.startsWith("http") ? v : "https://" + v);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}



export const organizationSchema = z.object({  //the record is an object with these fields.
  name: z.string().trim().min(1, "Entity name is required.").max(250, "Entity name must be 250 characters or fewer."),
  domainId: z.string().trim().min(1, "Choose a domain."),
  websiteUrl: z.string().trim().max(400, "Website must be 400 characters of fewer.").refine(
    (v) => v === "" || isValidUrl(v), "Enter a website like www.agency.ca.gov."
  ),
});

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100, "First name must be 100 characters or fewer."),
  middleName: z.string().trim().max(100, "Middle name must be 100 characters or fewer."),
  lastName: z.string().trim().min(1, "Last name is required.").max(100, "Last name must be 100 characters or fewer."),
  organizationId: z.string().trim().min(1, "Choose the organization this contact works for."),
  title: z.string().trim().max(300, "Title must be 300 characters or fewer."),
  phone: z.string().trim().refine(
    (v) => v === "" || v.replace(/\D/g, "").length === 10,
    "Enter a 10-digit phone number, like (916) 555-0123."
  ),
  // PHONE EXT (optional): /^\d{0,10}$/ = only digits, 0 to 10 of them (so empty is allowed too)
  phoneExt: z.string().trim().refine(
    (v) => /^\d{0,10}$/.test(v),
    "Extension must be numbers only, up to 10 digits."
  ),
  mobilePhone: z.string().trim().refine(
    (v) => v === "" || v.replace(/\D/g, "").length === 10,
    "Enter a 10-digit mobile number, like (916) 555-0123."
  ),
  // EMAIL: .toLowerCase() because Ryan's database only accepts lowercase emails
  email: z.string().trim().toLowerCase().refine(
    (v) => v === "" || z.email().safeParse(v).success,
    "Enter a valid email, like name@agency.ca.gov."
  ),
});