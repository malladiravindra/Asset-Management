import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from assets.models import Asset, Department, Location, Employee
from catalog.models import Category, Brand, Model
from organization.models import Vendor
from organization.codes import next_employee_id


class Command(BaseCommand):
    help = "Seeds vendors and programmatically generates 60 assets matching the frontend specs."

    def handle(self, *args, **options):
        self.stdout.write("Starting database seeding...")

        # 1. Create the 5 Seed Vendors
        vendors_data = [
            {
                "name": "Microsoft",
                "vendor_type": "software_publisher",
                "email": "licensing@microsoft.com",
                "phone": "+91 80000 10001",
                "status": "active",
            },
            {
                "name": "Amazon Business",
                "vendor_type": "marketplace",
                "email": "business-support@amazon.in",
                "phone": "+91 80000 10002",
                "status": "active",
            },
            {
                "name": "Ingram Micro",
                "vendor_type": "distributor",
                "email": "sales@ingrammicro.co.in",
                "phone": "+91 80000 10003",
                "status": "active",
            },
            {
                "name": "Redington",
                "vendor_type": "distributor",
                "email": "sales@redington.co.in",
                "phone": "+91 80000 10004",
                "status": "active",
            },
            {
                "name": "Reliance Digital Business",
                "vendor_type": "retailer",
                "email": "business@reliancedigital.in",
                "phone": "+91 80000 10005",
                "status": "active",
            },
        ]

        vendors_dict = {}
        for v_data in vendors_data:
            vendor, created = Vendor.objects.get_or_create(
                name=v_data["name"],
                defaults={
                    "vendor_type": v_data["vendor_type"],
                    "email": v_data["email"],
                    "phone": v_data["phone"],
                    "status": v_data["status"],
                },
            )
            if not created:
                vendor.vendor_type = v_data["vendor_type"]
                vendor.email = v_data["email"]
                vendor.phone = v_data["phone"]
                vendor.status = v_data["status"]
                vendor.save()
            vendors_dict[v_data["name"]] = vendor

        self.stdout.write(f"Seeded {len(vendors_dict)} vendors.")

        # Clean existing Assets and People to avoid duplicates/collisions before seeding
        Asset.objects.all().delete()
        Employee.objects.all().delete()
        self.stdout.write("Cleared existing assets and people for clean seed.")

        # Define breakdowns matching frontend
        STATUS_BREAKDOWN = [
            { "label": "Assigned", "count": 28 },
            { "label": "Available", "count": 17 },
            { "label": "In Repair", "count": 7 },
            { "label": "Reserved", "count": 5 },
            { "label": "Maintenance", "count": 3 },
        ]

        DEPARTMENT_BREAKDOWN = [
            { "label": "Engineering", "count": 14 },
            { "label": "Finance", "count": 11 },
            { "label": "Operations", "count": 10 },
            { "label": "Sales", "count": 9 },
            { "label": "Marketing", "count": 8 },
            { "label": "Human Resources", "count": 8 },
        ]

        CATEGORY_BREAKDOWN = [
            { "label": "Laptops", "count": 22, "tag": "LT", "models": ["Dell Latitude 5440", "HP EliteBook 840", "Lenovo ThinkPad X1", "MacBook Pro 14\""] },
            { "label": "Desktops", "count": 14, "tag": "DT", "models": ["HP EliteDesk 800", "Dell OptiPlex 7090", "Lenovo ThinkCentre M90"] },
            { "label": "Monitors", "count": 10, "tag": "MN", "models": ["LG UltraWide 34\"", "Dell UltraSharp 27\"", "Samsung Odyssey G5"] },
            { "label": "Mobile Devices", "count": 8, "tag": "MB", "models": ["iPhone 14", "Samsung Galaxy S23", "iPad Air"] },
            { "label": "Networking", "count": 4, "tag": "NW", "models": ["Cisco Catalyst 9200", "Netgear ProSAFE", "Ubiquiti UniFi AP"] },
            { "label": "Peripherals", "count": 2, "tag": "PR", "models": ["Logitech MX Master 3", "Dell KB216 Keyboard"] },
        ]

        LOCATIONS = [
            "HQ - Floor 1", "HQ - Floor 2", "HQ - Floor 3",
            "Mumbai Branch", "Pune Branch", "Bangalore Branch", "Remote",
        ]

        ASSIGNEES = [
            "Anjali Singh", "Rohit Verma", "Priya Patel", "Karan Mehta", "Neha Gupta",
            "Vikram Rao", "Sneha Iyer", "Arjun Nair", "Divya Menon", "Sanjay Kapoor",
            "Pooja Sharma", "Aditya Joshi", "Kavya Reddy", "Manish Kumar", "Ritu Malhotra",
        ]

        PROCUREMENT_VENDORS = [
            "Microsoft", "Amazon Business", "Ingram Micro", "Redington", "Reliance Digital Business",
        ]

        statusSeq = []
        for s in STATUS_BREAKDOWN:
            statusSeq.extend([s["label"]] * s["count"])

        departmentSeq = []
        for d in DEPARTMENT_BREAKDOWN:
            departmentSeq.extend([d["label"]] * d["count"])

        conditionSeq = ["Good"] * 40 + ["Fair"] * 15 + ["Poor"] * 5

        total = sum(c["count"] for c in CATEGORY_BREAKDOWN)
        shuffle = lambda i: (i * 37) % total

        def to_base36(num):
            chars = "0123456789abcdefghijklmnopqrstuvwxyz"
            if num == 0:
                return "0"
            res = []
            while num > 0:
                num, rem = divmod(num, 36)
                res.append(chars[rem])
            return "".join(reversed(res))

        def serial_for(index):
            val = (index * 7919) % 900 + 100
            return f"{to_base36(val).upper()}T4B3"

        def get_brand_name(model_name):
            first_word = model_name.split()[0]
            if first_word in ["MacBook", "iPhone", "iPad"]:
                return "Apple"
            return first_word

        warranty_years_map = {
            "Laptops": 3,
            "Desktops": 3,
            "Monitors": 2,
            "Mobile Devices": 1,
            "Networking": 5,
            "Peripherals": 1,
        }

        id_counter = 1
        assigned_cursor = 0

        with transaction.atomic():
            for cat in CATEGORY_BREAKDOWN:
                cat_label = cat["label"]
                cat_tag = cat["tag"]
                models_list = cat["models"]
                count = cat["count"]

                category_obj, _ = Category.objects.get_or_create(name=cat_label)

                for i in range(count):
                    global_index = id_counter - 1
                    shuffled = shuffle(global_index)

                    status = statusSeq[shuffled % len(statusSeq)]
                    model_name = models_list[i % len(models_list)]
                    cost = 25000 + ((id_counter * 3671) % 60000)

                    serial = serial_for(id_counter)
                    dept_name = departmentSeq[shuffle(global_index + 11) % len(departmentSeq)]
                    loc_name = LOCATIONS[global_index % len(LOCATIONS)]

                    department_obj, _ = Department.objects.get_or_create(name=dept_name)
                    location_obj, _ = Location.objects.get_or_create(name=loc_name)

                    brand_name = get_brand_name(model_name)
                    brand_obj, _ = Brand.objects.get_or_create(name=brand_name)

                    model_obj, _ = Model.objects.get_or_create(
                        name=model_name,
                        defaults={"category": category_obj, "brand": brand_obj},
                    )

                    assigned_to = None
                    if status == "Assigned":
                        assignee_name = ASSIGNEES[assigned_cursor % len(ASSIGNEES)]
                        assigned_cursor += 1
                        assigned_to = Employee.objects.filter(name__iexact=assignee_name.strip()).first()
                        if not assigned_to:
                            assigned_to = Employee.objects.create(
                                name=assignee_name.strip(),
                                employee_id=next_employee_id(),
                                department=department_obj,
                                location=location_obj,
                                is_active=True
                            )

                    condition = conditionSeq[shuffle(global_index + 23) % len(conditionSeq)]

                    ageDays = 15 + (shuffle(global_index + 41) * 47 + id_counter * 17) % 800
                    ageYears = ageDays / 365.0
                    current_value = round(cost * max(0.15, 1.0 - ageYears * 0.22))

                    warranty_years = warranty_years_map.get(cat_label, 2)
                    days_to_expiry = warranty_years * 365 - ageDays
                    warranty_status = "Expired" if days_to_expiry < 0 else ("Expiring" if days_to_expiry <= 90 else "Active")

                    vendor_name = PROCUREMENT_VENDORS[global_index % len(PROCUREMENT_VENDORS)]
                    vendor_obj = vendors_dict[vendor_name]

                    Asset.objects.create(
                        asset_code=f"AF-{cat_tag}-{str(i + 1).zfill(4)}",
                        name=model_name,
                        category=category_obj,
                        brand=brand_obj,
                        model=model_obj,
                        serial_number=serial,
                        department=department_obj,
                        location=location_obj,
                        assigned_to=assigned_to,
                        vendor=vendor_obj,
                        status=status,
                        condition=condition,
                        cost=Decimal(cost),
                        current_value=Decimal(current_value),
                        warranty_status=warranty_status,
                    )

                    id_counter += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {id_counter - 1} assets."))
