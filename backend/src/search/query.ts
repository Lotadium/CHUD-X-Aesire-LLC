import type { SearchOperators } from "./provider.ts";

export type SearchContext = {
  firstName: string;
  lastName: string;

  organizationName?: string;
  middleName?: string;
  nameSuffix?: string;
  title?: string;
  departmentName?: string;
  organizationDomain?: string;
  city?: string;
  county?: string;
  state?: string;
};

/** builds a web search query from context data to give to a search provider */
export function queryBuilder(context: SearchContext, providerOperators: SearchOperators): string {
  const name: string = [
    context.firstName,
    context.middleName,
    context.lastName,
    context.nameSuffix,
  ].filter(Boolean).join(" ");
  const job: string = [
    context.title,
    context.organizationName,
    context.departmentName,
    context.organizationDomain ? providerOperators?.domain?.(context?.organizationDomain) : null,
  ].filter(Boolean).join(" ");
  const location: string = [
    context.city,
    context.state,
    context.county ? context.county + " county" : null
  ].filter(Boolean).join(", ");
  const query: string = [name, job, location].filter(Boolean).join(" ");
  return providerOperators.escape(query);
}
