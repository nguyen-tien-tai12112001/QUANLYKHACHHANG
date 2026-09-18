PERMISSIONS = {
    "DASHBOARD_VIEW": "dashboard:view",
    "DASHBOARD_DRILLDOWN": "dashboard:drilldown",
    "DASHBOARD_EXPORT": "dashboard:export",
    "CUSTOMER_VIEW": "customer:view",
    "CUSTOMER_PROFILE_VIEW": "customer:profile:view",
    "CUSTOMER_EXPORT": "customer:export",
    "CUSTOMER_SENSITIVE_IDENTITY": "customer:sensitive:identity",
    "CUSTOMER_SENSITIVE_CONTACT": "customer:sensitive:contact",
    "CUSTOMER_SENSITIVE_ACCOUNT": "customer:sensitive:account",
    "CUSTOMER_SENSITIVE_TRANSACTION": "customer:sensitive:transaction",
    "CUSTOMER_SENSITIVE_LOAN": "customer:sensitive:loan",
    "CUSTOMER_SENSITIVE_COPY": "customer:sensitive:copy",
    "CUSTOMER_VIEW_CALCULATION_TRACE": "customer:view_calculation_trace",
    "ANALYTICS_VIEW": "analytics:view",
    "ANALYTICS_EXPORT": "analytics:export",
    "WAREHOUSE_VIEW": "warehouse:view",
    "WAREHOUSE_IMPORT": "warehouse:import",
    "CIF_VIEW": "cif:view",
    "PROCESSING_VIEW": "processing:view",
    "REPORT_VIEW": "report:view",
    "BRANCH_VIEW_ALL": "branch.view_all",
    "BRANCH_VIEW_OWN": "branch.view_own",
    "ADMIN_ACCESS_TEST": "admin:access_test",
    "ADMIN": "admin",
}


# Dependencies are also used when evaluating direct DENY overrides: denying a
# parent permission automatically makes every dependent permission ineffective.
PERMISSION_PREREQUISITES = {
    "dashboard:drilldown": "dashboard:view",
    "dashboard:export": "dashboard:view",
    "customer:profile:view": "customer:view",
    "customer:deposit:view": "customer:profile:view",
    "customer:credit:view": "customer:profile:view",
    "customer:income:view": "customer:profile:view",
    "customer:export": "customer:view",
    "customer:sensitive:identity": "customer:profile:view",
    "customer:sensitive:contact": "customer:profile:view",
    "customer:sensitive:account": "customer:deposit:view",
    "customer:sensitive:transaction": "customer:deposit:view",
    "customer:sensitive:loan": "customer:credit:view",
    "customer:sensitive:copy": "customer:profile:view",
    "customer:view_calculation_trace": "customer:profile:view",
    "analytics:export": "analytics:view",
    "warehouse:import": "warehouse:view",
    "warehouse:replace": "warehouse:view",
    "warehouse:delete": "warehouse:view",
    "warehouse:summarize": "warehouse:view",
    "cif:import": "cif:view",
    "cif:review": "cif:view",
    "cif:override": "cif:view",
    "processing:run": "processing:view",
    "processing:recover": "processing:view",
    "reconciliation:review": "reconciliation:view",
    "mapping:write": "mapping:view",
    "report:summarize": "report:view",
    "report:export": "report:view",
    "admin:branch:write": "admin:branch:view",
    "admin:department:write": "admin:department:view",
    "admin:user:write": "admin:user:view",
    "admin:role:write": "admin:role:view",
    "admin:config:write": "admin:config:view",
    "admin:access_test": "admin:user:view",
}

SENSITIVE_PERMISSION_CODES = {
    "customer:sensitive:identity",
    "customer:sensitive:contact",
    "customer:sensitive:account",
    "customer:sensitive:transaction",
    "customer:sensitive:loan",
    "customer:sensitive:copy",
}


def expand_denied_permissions(permission_codes) -> set[str]:
    """Apply DENY transitively so a denied prerequisite cannot be bypassed."""

    denied = {str(code).strip().lower() for code in permission_codes or [] if str(code).strip()}
    changed = True
    while changed:
        changed = False
        for code, prerequisite in PERMISSION_PREREQUISITES.items():
            if prerequisite in denied and code not in denied:
                denied.add(code)
                changed = True
    return denied

SCOPES = {
    "PROVINCE": "province",
    "BRANCH": "branch",
    "PGD": "pgd",
    "OWN": "own",
}
