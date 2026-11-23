/**
 * Centralized permission-aware navigation & breadcrumb definition shared by
 * both VerticalLayout and HorizontalLayout.
 *
 * Only active implemented routes are listed here (no dead or fake links).
 */
export const NAVIGATION_ITEMS = [
  {
    id: "system-status",
    labelKey: "nav.systemStatus",
    icon: "bi-activity",
    to: "/",
    end: true,
  },
  {
    id: "sales-pos",
    labelKey: "nav.salesPos",
    icon: "bi-cart-check",
    children: [
      {
        id: "pos-checkout",
        labelKey: "nav.posCheckout",
        icon: "bi-cash-register",
        to: "/pos",
        permission: "sales.create",
      },
      {
        id: "sales-history",
        labelKey: "nav.salesHistory",
        icon: "bi-receipt",
        to: "/sales",
        permission: "sales.view",
      },
    ],
  },
  {
    id: "catalog",
    labelKey: "nav.catalog",
    icon: "bi-tags",
    children: [
      {
        id: "products",
        labelKey: "nav.products",
        icon: "bi-box-seam",
        to: "/products",
        permission: "products.view",
      },
      {
        id: "categories",
        labelKey: "nav.categories",
        icon: "bi-diagram-3",
        to: "/categories",
        permission: "products.view",
      },
      {
        id: "units",
        labelKey: "nav.units",
        icon: "bi-rulers",
        to: "/units",
        permission: "products.view",
      },
    ],
  },
  {
    id: "inventory",
    labelKey: "nav.inventory",
    icon: "bi-boxes",
    children: [
      {
        id: "inventory-overview",
        labelKey: "nav.inventoryOverview",
        icon: "bi-clipboard-data",
        to: "/inventory",
        permission: "inventory.view",
      },
    ],
  },
  {
    id: "purchasing",
    labelKey: "nav.purchasing",
    icon: "bi-truck",
    children: [
      {
        id: "purchases",
        labelKey: "nav.purchases",
        icon: "bi-receipt-cutoff",
        to: "/purchasing",
        permission: "purchases.view",
      },
    ],
  },
  {
    id: "finance",
    labelKey: "nav.finance",
    icon: "bi-wallet2",
    children: [
      {
        id: "expenses",
        labelKey: "nav.expenses",
        icon: "bi-cash-coin",
        to: "/expenses",
        permission: "expenses.view",
      },
      {
        id: "reports",
        labelKey: "nav.reports",
        icon: "bi-bar-chart-line",
        to: "/reports",
        permission: "reports.view",
      },
    ],
  },
  {
    id: "administration",
    labelKey: "nav.administration",
    icon: "bi-shield-lock",
    children: [
      {
        id: "users",
        labelKey: "nav.users",
        icon: "bi-people",
        to: "/users",
        permission: "users.view",
      },
      {
        id: "roles",
        labelKey: "nav.roles",
        icon: "bi-key",
        to: "/roles",
        permission: "roles.view",
      },
      {
        id: "settings",
        labelKey: "nav.settings",
        icon: "bi-gear",
        to: "/settings",
        permission: "settings.view",
      },
      {
        id: "audit-logs",
        labelKey: "nav.auditLogs",
        icon: "bi-journal-check",
        to: "/audit-logs",
        permission: "audit.view",
      },
    ],
  },
  {
    id: "account",
    labelKey: "nav.account",
    icon: "bi-person-circle",
    children: [
      {
        id: "profile",
        labelKey: "nav.profile",
        icon: "bi-sliders",
        to: "/profile",
      },
    ],
  },
];

/**
 * Filter navigation tree recursively based on the current user's permissions.
 * Parent groups with no permitted children are omitted automatically.
 */
export function filterNavigationByPermission(items, hasPermission) {
  const result = [];

  for (const item of items) {
    if (item.permission && !hasPermission(item.permission)) {
      continue;
    }

    if (item.children) {
      const visibleChildren = filterNavigationByPermission(item.children, hasPermission);
      if (visibleChildren.length > 0) {
        result.push({ ...item, children: visibleChildren });
      }
      continue;
    }

    result.push(item);
  }

  return result;
}

/**
 * Resolve breadcrumb trail from the active pathname using NAVIGATION_ITEMS.
 */
export function resolveBreadcrumbs(pathname) {
  const rootCrumb = { labelKey: "nav.systemStatus", to: "/" };

  if (!pathname || pathname === "/") {
    return [rootCrumb];
  }

  if (pathname === "/unauthorized") {
    return [rootCrumb, { labelKey: "nav.unauthorized", to: "/unauthorized" }];
  }

  for (const item of NAVIGATION_ITEMS) {
    if (item.to && item.to === pathname) {
      return [rootCrumb, { labelKey: item.labelKey, to: item.to }];
    }
    if (item.children) {
      for (const child of item.children) {
        if (child.to === pathname) {
          return [
            rootCrumb,
            { labelKey: item.labelKey, to: null },
            { labelKey: child.labelKey, to: child.to },
          ];
        }
      }
    }
  }

  return [rootCrumb, { labelKey: "nav.notFound", to: pathname }];
}

export function isItemActive(item, pathname) {
  if (item.to) {
    return item.end ? pathname === item.to : pathname.startsWith(item.to);
  }
  if (item.children) {
    return item.children.some((child) => isItemActive(child, pathname));
  }
  return false;
}
