"""
Regroups the Django Admin index/sidebar into the product's real modules —
Accounts / Assets / Catalog / Organization — independent of which Django
app's models.py a model happens to be physically defined in.

ROOT CAUSE this works around: Django's admin groups models by
`Model._meta.app_label`, which defaults to the app whose models.py the
class is written in. Employee, Department and Location are all defined in
assets/models.py (see the comment there — they were built for the Add
Asset form and reused as-is by the Organization/Locations pages), so their
app_label is "assets" no matter which admin.py registers them. That's why
Employees and Locations show up under ASSETS today even though
organization/admin.py talks about "reusing" them — admin.py's
@admin.register() controls *whether* a model has an admin UI, not which
sidebar section it lands in.

Fixing this by giving Employee/Location an explicit app_label="organization"
would change their default db_table (assets_employee -> organization_employee),
which is a real schema change requiring a migration just to relabel a
sidebar entry — exactly what we're told not to do. Overriding
AdminSite.get_app_list is the supported, model/schema/migration-free way to
change *only* the admin's presentation. `AdminSite.app_index` (the page
behind clicking an app's header, e.g. /admin/organization/) already calls
`self.get_app_list(request, app_label)` itself, so overriding this single
method keeps the sidebar and that page in sync automatically.

No model, ModelAdmin registration, or migration is touched by this file:
every model below is still registered exactly once (in its existing
app's admin.py, with its existing list_display/list_filter/search_fields/
autocomplete_fields/fieldsets), just displayed under a different heading.
"""
import types

from django.urls import reverse

# (bucket_key, display name, [(model, display-name override or None)]).
#
# bucket_key doubles as the app_label used for the /admin/<bucket_key>/
# app-index link — it's an arbitrary string, not required to match any
# model's real app_label (and deliberately doesn't, for Employee/Location).
#
# Order here is the exact order things render in — the override below
# does not re-sort alphabetically like stock Django, so this list order
# IS the sidebar order.
#
# NOTE for future changes: a new model registered in the admin that isn't
# added here won't be hidden (see the safety net in build_module_app_list
# below) but will show up under its own real app instead of merging
# cleanly into one of these four sections — add it here too.
def _module_groups():
    from accounts.models import AccountUser
    from assets.models import Asset, Department, Location, Employee
    from catalog.models import Brand, Category, Model
    from organization.models import Vendor

    return [
        ("accounts", "Accounts", [(AccountUser, None)]),
        ("assets", "Assets", [(Asset, None), (Department, None)]),
        ("catalog", "Catalog", [
            (Model, "Models"),  # default verbose_name_plural is "models" (lowercase m)
            (Brand, None),
            (Category, None),
        ]),
        ("organization", "Organization", [(Employee, None), (Location, None), (Vendor, None)]),
    ]


def build_module_app_list(site, request, app_label=None):
    """Same return shape as AdminSite.get_app_list (a list of app dicts),
    grouped by the module map above instead of by real app_label. Reuses
    AdminSite._build_app_dict for the actual per-model permission checks
    and admin_url/add_url computation, so permissions and links behave
    exactly as stock Django — only the grouping changes."""
    real_app_dict = site._build_app_dict(request)

    model_dict_by_model = {}
    for app in real_app_dict.values():
        for model_dict in app["models"]:
            model_dict_by_model[model_dict["model"]] = model_dict

    placed = set()
    app_list = []
    for bucket_key, display_name, entries in _module_groups():
        if app_label is not None and app_label != bucket_key:
            continue
        bucket_models = []
        for model, name_override in entries:
            model_dict = model_dict_by_model.get(model)
            if model_dict is None:
                continue  # not registered, or the requesting user has no perms on it
            placed.add(model)
            if name_override:
                model_dict = {**model_dict, "name": name_override}
            bucket_models.append(model_dict)
        if not bucket_models:
            continue
        app_list.append({
            "name": display_name,
            "app_label": bucket_key,
            "app_url": reverse(
                "admin:app_list", kwargs={"app_label": bucket_key}, current_app=site.name
            ),
            "has_module_perms": True,
            "models": bucket_models,
        })

    # Safety net: anything registered in the admin but not covered by the
    # module map above still shows up (under its real app), instead of
    # silently disappearing from the sidebar.
    for real_label, app in real_app_dict.items():
        if app_label is not None and app_label != real_label:
            continue
        leftover = [md for md in app["models"] if md["model"] not in placed]
        if leftover:
            app_list.append({**app, "models": leftover})

    return app_list


def install(site):
    """Monkeypatch get_app_list onto the given AdminSite instance (the
    default django.contrib.admin.site) — avoids swapping in a custom
    AdminSite subclass, which would need changes to settings.py/urls.py."""

    def get_app_list(self, request, app_label=None):
        return build_module_app_list(self, request, app_label)

    site.get_app_list = types.MethodType(get_app_list, site)
