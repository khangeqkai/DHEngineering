// Shared snake_case → camelCase shapes for the two halves of a customer: the
// company (the customer itself, which owns the folder on disk) and the contact
// people who work there. Both routers and the search route use these so a company
// or a person reads the same everywhere.

const toCompanyApi = (c) => ({
  id: c.id,
  name: c.name,
  address: c.address,
  notes: c.notes,
  archived: !!c.archived,
  createdAt: c.created_at,
  updatedAt: c.updated_at
});

// A person always carries the company they're at, since one is never shown
// without the other. company_name / company_archived come from the join in
// contactQueries.
const toContactApi = (c) => ({
  id: c.id,
  companyId: c.company_id,
  companyName: c.company_name,
  companyArchived: !!c.company_archived,
  contactName: c.contact_name,
  phone: c.phone,
  email: c.email,
  archived: !!c.archived,
  createdAt: c.created_at,
  updatedAt: c.updated_at
});

module.exports = { toCompanyApi, toContactApi };
