// What the app remembers about how someone left a screen, for as long as they stay
// signed in. Held in this module's memory only — never in browser storage — and
// wiped by forgetSessionMemory(), which every kind of sign-out calls (AuthContext
// has the one place), so the next person to sign in never inherits it.

let jobListView = null;
let searchView = null;

// The job list's filter, worker filter, "My Jobs" and sort. Search words are
// deliberately not part of it: the box always starts empty.
export function rememberJobListView(view) {
  jobListView = { ...view };
}

export function recallJobListView() {
  return jobListView ? { ...jobListView } : null;
}

// The full Search page: its words, tab, filters and page, so Back from a result
// lands on the same search. The sidebar link ignores it and starts empty.
export function rememberSearchView(view) {
  searchView = { ...view };
}

export function recallSearchView() {
  return searchView ? { ...searchView } : null;
}

export function forgetSessionMemory() {
  jobListView = null;
  searchView = null;
}
