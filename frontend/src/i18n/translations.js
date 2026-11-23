/**
 * Bilingual UI dictionary (English & Khmer) for the POS UI framework shell,
 * navigation, common controls, and Auth/RBAC pages.
 */
export const TRANSLATIONS = {
  en: {
    app: {
      subtitle: "Point of Sale Platform",
      footerLabel: "POS UI Framework · Auth & RBAC Foundation",
    },
    nav: {
      systemStatus: "System Status",
      administration: "Administration",
      users: "Users",
      roles: "Roles & Permissions",
      account: "Account",
      profile: "Profile & Security",
      unauthorized: "Access Denied",
      notFound: "Page Not Found",
    },
    controls: {
      layoutVertical: "Vertical Layout",
      layoutHorizontal: "Horizontal Layout",
      switchLayout: "Switch layout",
      themeLight: "Light Mode",
      themeDark: "Dark Mode",
      switchTheme: "Toggle theme",
      sidebarExpanded: "Full Sidebar",
      sidebarMini: "Mini Sidebar",
      sidebarCollapsed: "Hide Sidebar",
      cycleSidebar: "Cycle sidebar mode",
      openMenu: "Open navigation menu",
      signOut: "Sign Out",
      signingOut: "Signing out...",
      refresh: "Refresh",
      recheckApi: "Recheck API",
      checking: "Checking...",
      save: "Save",
      saving: "Saving...",
      cancel: "Cancel",
      confirm: "Confirm",
      retry: "Retry",
      close: "Close",
      edit: "Edit",
      delete: "Delete",
      activate: "Activate",
      deactivate: "Deactivate",
      search: "Search",
    },
    status: {
      connected: "Connected",
      unavailable: "Unavailable",
      active: "Active",
      inactive: "Inactive",
      loading: "Loading...",
      emptyTitle: "No records found",
      errorTitle: "Something went wrong",
    },
    pages: {
      systemStatusTitle: "POS System Status",
      systemStatusSubtitle: "Shared UI shell, backend health connectivity, and active access scope.",
      usersTitle: "User Management",
      usersSubtitle: "Manage POS staff accounts, active status, and role assignments.",
      newUser: "New User",
      rolesTitle: "Roles & Permissions",
      rolesSubtitle: "Configure roles and granular module.action permissions enforced server-side.",
      newRole: "New Role",
      profileTitle: "My Profile & Preferences",
      profileSubtitle: "Manage your personal details, UI preferences, and account password.",
    },
  },
  km: {
    app: {
      subtitle: "ប្រព័ន្ធលក់ទំនិញ (POS)",
      footerLabel: "គ្រោងការណ៍ POS UI · ប្រព័ន្ធផ្ទៀងផ្ទាត់ និងសិទ្ធិ",
    },
    nav: {
      systemStatus: "ស្ថានភាពប្រព័ន្ធ",
      administration: "ការគ្រប់គ្រង",
      users: "អ្នកប្រើប្រាស់",
      roles: "តួនាទី និងសិទ្ធិ",
      account: "គណនី",
      profile: "ព័ត៌មានផ្ទាល់ខ្លួន និងសុវត្ថិភាព",
      unauthorized: "គ្មានសិទ្ធិចូលប្រើ",
      notFound: "រកមិនឃើញទំព័រ",
    },
    controls: {
      layoutVertical: "ប្លង់បញ្ឈរ",
      layoutHorizontal: "ប្លង់ផ្ដេក",
      switchLayout: "ប្ដូរប្លង់ម៉ឺនុយ",
      themeLight: "ផ្ទៃភ្លឺ",
      themeDark: "ផ្ទៃងងឹត",
      switchTheme: "ប្ដូរផ្ទៃពណ៌",
      sidebarExpanded: "របារចំហៀងពេញ",
      sidebarMini: "របារចំហៀងតូច",
      sidebarCollapsed: "លាក់របារចំហៀង",
      cycleSidebar: "ប្ដូរទំហំរបារចំហៀង",
      openMenu: "បើកម៉ឺនុយ",
      signOut: "ចាកចេញ",
      signingOut: "កំពុងចាកចេញ...",
      refresh: "ផ្ទុកឡើងវិញ",
      recheckApi: "ពិនិត្យ API ឡើងវិញ",
      checking: "កំពុងពិនិត្យ...",
      save: "រក្សាទុក",
      saving: "កំពុងរក្សាទុក...",
      cancel: "បោះបង់",
      confirm: "បញ្ជាក់",
      retry: "ព្យាយាមម្ដងទៀត",
      close: "បិទ",
      edit: "កែប្រែ",
      delete: "លុប",
      activate: "បើកដំណើរការ",
      deactivate: "បិទដំណើរការ",
      search: "ស្វែងរក",
    },
    status: {
      connected: "បានភ្ជាប់",
      unavailable: "មិនអាចភ្ជាប់បាន",
      active: "សកម្ម",
      inactive: "អសកម្ម",
      loading: "កំពុងផ្ទុក...",
      emptyTitle: "មិនមានទិន្នន័យ",
      errorTitle: "មានបញ្ហាកើតឡើង",
    },
    pages: {
      systemStatusTitle: "ស្ថានភាពប្រព័ន្ធ POS",
      systemStatusSubtitle: "ប្លង់រួម ការតភ្ជាប់ម៉ាស៊ីនមេ និងសិទ្ធិប្រើប្រាស់បច្ចុប្បន្ន។",
      usersTitle: "ការគ្រប់គ្រងអ្នកប្រើប្រាស់",
      usersSubtitle: "គ្រប់គ្រងគណនីបុគ្គលិក ស្ថានភាពសកម្ម និងការកំណត់តួនាទី។",
      newUser: "បង្កើតអ្នកប្រើប្រាស់ថ្មី",
      rolesTitle: "តួនាទី និងសិទ្ធិប្រើប្រាស់",
      rolesSubtitle: "កំណត់តួនាទី និងសិទ្ធិលម្អិតតាមម៉ូឌុលដែលគ្រប់គ្រងដោយម៉ាស៊ីនមេ។",
      newRole: "បង្កើតតួនាទីថ្មី",
      profileTitle: "ព័ត៌មានផ្ទាល់ខ្លួន និងការកំណត់",
      profileSubtitle: "កែប្រែព័ត៌មានផ្ទាល់ខ្លួន ចំណូលចិត្តប្លង់ និងពាក្យសម្ងាត់។",
    },
  },
};

export function translate(language, key, fallback) {
  const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
  const parts = key.split(".");
  let current = dict;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      current = null;
      break;
    }
  }
  if (typeof current === "string") {
    return current;
  }
  if (language !== "en") {
    return translate("en", key, fallback);
  }
  return fallback || key;
}
