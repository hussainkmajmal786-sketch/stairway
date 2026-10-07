/** Whether a dashboard nav item is the current page: exact items match only themselves, others also their sub-paths. */
export function isNavActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
