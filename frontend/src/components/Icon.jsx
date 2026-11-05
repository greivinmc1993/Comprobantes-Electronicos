import React from 'react';
const paths={
  grid:<><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></>,
  file:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
  report:<><path d="M4 20V10M10 20V4M16 20v-8M22 20V7"/><path d="M2 20h21"/></>,
  building:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-4h4v4"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,
  upload:<><path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
  download:<><path d="M12 3v13m-5-5 5 5 5-5"/><path d="M4 18v3h16v-3"/></>,
  // Acciones dentro de la aplicación: entrar datos o sacar datos.
  importar:<><path d="M4 17v3h16v-3"/><path d="M12 3v13m-5-5 5 5 5-5"/></>,
  exportar:<><path d="M4 17v3h16v-3"/><path d="M12 16V3m-5 5 5-5 5 5"/></>,
  search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  chevron:<path d="m6 9 6 6 6-6"/>,
  arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
  close:<path d="M5 5l14 14M19 5 5 19"/>,
  trash:<><path d="M3 6h18M8 6V4h8v2m-10 0 1 15h10l1-15M10 10v7m4-7v7"/></>,
  edit:<><path d="M12 20H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/><path d="m14 5 5 5M10 14l9-9 2 2-9 9-4 1z"/></>,
  receipt:<><path d="M4 2v20l4-2 4 2 4-2 4 2V2l-4 2-4-2-4 2z"/><path d="M8 10h8M8 14h8"/></>,
  shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
  folder:<><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
  database:<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/></>,
  filter:<><path d="M4 5h16M7 12h10m-7 7h4"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18"/></>,
  check:<path d="m4 12 5 5L20 6"/>,
  alert:<><circle cx="12" cy="12" r="10"/><path d="M12 7v6m0 4v.1"/></>,
  menu:<path d="M3 6h18M3 12h18M3 18h18"/>,
  refresh:<><path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/></>,
  transfer:<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>,
  wallet:<><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10h18M7 6V4a2 2 0 0 1 2-2h10"/><path d="M16 16h2"/></>,
  tax:<><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 19 19 5"/></>,
  trend:<path d="m3 17 6-6 4 4 8-9m-7 0h7v7"/>,
  info:<><circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v.1"/></>,
  external:<><path d="M13 5h6v6m0-6-9 9"/><path d="M19 14v5H5V5h5"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/></>,
};
export default function Icon({name,size=19,className='',...props}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>{paths[name]||paths.file}</svg>;
}
