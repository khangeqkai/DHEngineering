/**
 * Default public-holiday list that ships with the app: Victoria (VIC), Australia
 * for 2026. Dates are local YYYY-MM-DD, the same shape the Labour Rates & Overtime
 * page stores. This is only a starting default — admins add or remove dates freely.
 *
 * Source: official Victorian public holidays 2026 (business.vic.gov.au). ANZAC Day
 * falls on a Saturday in 2026 with no substitute day; Boxing Day falls on a Saturday
 * so the Monday (28 Dec) is gazetted as an additional public holiday.
 *
 * Note: the "Friday before the AFL Grand Final" date is set by the AFL fixture each
 * year and is not officially gazetted long in advance; 2026-09-25 is the widely
 * published expected date and can be corrected on the settings page once confirmed.
 */
const DEFAULT_VIC_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day (Thu)
  '2026-01-26', // Australia Day (Mon)
  '2026-03-09', // Labour Day (Mon)
  '2026-04-03', // Good Friday (Fri)
  '2026-04-04', // Saturday before Easter Sunday (Sat)
  '2026-04-05', // Easter Sunday (Sun)
  '2026-04-06', // Easter Monday (Mon)
  '2026-04-25', // ANZAC Day (Sat)
  '2026-06-08', // King's Birthday (Mon)
  '2026-09-25', // Friday before the AFL Grand Final (Fri, expected)
  '2026-11-03', // Melbourne Cup Day (Tue)
  '2026-12-25', // Christmas Day (Fri)
  '2026-12-26', // Boxing Day (Sat)
  '2026-12-28'  // Additional Boxing Day holiday (Mon)
];

module.exports = { DEFAULT_VIC_PUBLIC_HOLIDAYS_2026 };
