# Requirements Document

## Introduction

The Smart Shop Inventory Management System (SSIMS) is a web-based application that enables shopkeepers to efficiently manage their product inventory. The system tracks stock levels, monitors expiry dates, locates products within the shop, and proactively notifies shopkeepers about low stock, out-of-stock, and near-expiry items. It also provides a dashboard overview and reporting/analytics capabilities.

## Glossary

- **SSIMS**: Smart Shop Inventory Management System — the web application described in this document.
- **Shopkeeper**: The authenticated user who manages the shop's inventory.
- **Product**: A single inventory item with attributes such as name, category, quantity, location, and expiry date.
- **Category**: A logical grouping of products (e.g., Dairy, Beverages, Snacks).
- **Stock_Level**: The current quantity of a product in inventory.
- **Minimum_Threshold**: The shopkeeper-defined quantity below which a product is considered low stock.
- **Location**: A physical position in the shop described by rack, shelf, and section identifiers.
- **Expiry_Date**: The date after which a product is considered expired.
- **Near_Expiry_Window**: A shopkeeper-configurable number of days before expiry within which a product is flagged as near-expiry (default: 30 days).
- **Alert**: A system-generated notification displayed on the dashboard or sent via SMS/Email.
- **Dashboard**: The main overview screen showing inventory health metrics and active alerts.
- **Report**: A generated summary of stock usage, sales trends, or expiry wastage over a time period.

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a shopkeeper, I want to securely log in to the system, so that only authorized users can access and modify inventory data.

#### Acceptance Criteria

1. THE SSIMS SHALL require a valid username and password before granting access to any inventory feature.
2. WHEN a shopkeeper submits valid credentials, THE SSIMS SHALL authenticate the session and redirect to the Dashboard.
3. IF a shopkeeper submits invalid credentials, THEN THE SSIMS SHALL display an error message and deny access.
4. WHEN a session is inactive for 30 consecutive minutes, THE SSIMS SHALL automatically terminate the session and require re-authentication.
5. THE SSIMS SHALL store passwords using a cryptographic hashing algorithm with a unique salt per user.

---

### Requirement 2: Product Management

**User Story:** As a shopkeeper, I want to add, update, and delete products in the inventory, so that the product catalog accurately reflects what is available in the shop.

#### Acceptance Criteria

1. WHEN a shopkeeper submits a new product form with a name, category, quantity, and location, THE SSIMS SHALL create a new Product record and confirm creation.
2. IF a shopkeeper submits a new product form with a missing required field (name, category, quantity, or location), THEN THE SSIMS SHALL display a field-level validation error and reject the submission.
3. WHEN a shopkeeper updates an existing product's attributes, THE SSIMS SHALL persist the changes and display the updated product record.
4. WHEN a shopkeeper deletes a product, THE SSIMS SHALL remove the product record and confirm deletion.
5. THE SSIMS SHALL assign a unique identifier to each Product at creation time.
6. THE SSIMS SHALL support assigning an optional expiry date to a Product at creation or update time.

---

### Requirement 3: Category Management

**User Story:** As a shopkeeper, I want to organize products into categories, so that I can browse and filter inventory by product type.

#### Acceptance Criteria

1. THE SSIMS SHALL allow a shopkeeper to create, rename, and delete categories.
2. WHEN a shopkeeper assigns a product to a category, THE SSIMS SHALL associate the product with that category.
3. IF a shopkeeper attempts to delete a category that contains one or more products, THEN THE SSIMS SHALL prompt the shopkeeper to reassign or delete those products before proceeding.
4. THE SSIMS SHALL display the category name alongside each product in all product listings.

---

### Requirement 4: Stock Level Monitoring

**User Story:** As a shopkeeper, I want to define a minimum stock threshold per product, so that I am alerted when stock falls to a critical level.

#### Acceptance Criteria

1. WHEN a shopkeeper sets a Minimum_Threshold for a product, THE SSIMS SHALL persist the threshold value against that product.
2. WHILE a product's Stock_Level is greater than zero and less than or equal to its Minimum_Threshold, THE SSIMS SHALL classify the product as "Low Stock".
3. WHILE a product's Stock_Level is equal to zero, THE SSIMS SHALL classify the product as "Out of Stock".
4. WHEN a product's classification changes to "Low Stock" or "Out of Stock", THE SSIMS SHALL generate an Alert and display it on the Dashboard.
5. THE SSIMS SHALL update a product's Stock_Level when a shopkeeper records a stock addition or reduction.

---

### Requirement 5: Expiry Date Management

**User Story:** As a shopkeeper, I want to track expiry dates for perishable products, so that I can remove expired items and reduce wastage.

#### Acceptance Criteria

1. WHEN a product's Expiry_Date is within the Near_Expiry_Window, THE SSIMS SHALL classify the product as "Near Expiry" and generate an Alert.
2. WHEN a product's Expiry_Date is earlier than the current date, THE SSIMS SHALL classify the product as "Expired" and generate an Alert.
3. THE SSIMS SHALL display the expiry status ("Near Expiry" or "Expired") alongside the product in all product listings.
4. THE SSIMS SHALL allow a shopkeeper to filter the product list by expiry status: "Near Expiry", "Expired", or "Valid".
5. THE SSIMS SHALL allow a shopkeeper to configure the Near_Expiry_Window in days; the default value SHALL be 30 days.

---

### Requirement 6: Product Location Tracking

**User Story:** As a shopkeeper, I want to assign and search for a product's physical location in the shop, so that I can quickly find any item on the shelves.

#### Acceptance Criteria

1. WHEN a shopkeeper assigns a Location to a product, THE SSIMS SHALL store the rack, shelf, and section identifiers for that product.
2. WHEN a shopkeeper searches for a product by name or category, THE SSIMS SHALL display the product's Location (rack, shelf, section) in the search results.
3. IF a product has no Location assigned, THEN THE SSIMS SHALL display "Location not set" in place of location details.
4. THE SSIMS SHALL allow a shopkeeper to update a product's Location at any time.

---

### Requirement 7: Search and Filter

**User Story:** As a shopkeeper, I want to search and filter the product list, so that I can quickly find specific products or groups of products.

#### Acceptance Criteria

1. WHEN a shopkeeper enters a search term, THE SSIMS SHALL return all products whose name or category contains the search term (case-insensitive).
2. THE SSIMS SHALL return search results within 2 seconds of query submission.
3. THE SSIMS SHALL allow a shopkeeper to filter the product list by one or more of the following criteria simultaneously: category, stock status ("Low Stock", "Out of Stock", "In Stock"), and expiry status ("Near Expiry", "Expired", "Valid").
4. WHEN no products match the applied search or filter criteria, THE SSIMS SHALL display a "No products found" message.
5. THE SSIMS SHALL allow a shopkeeper to clear all active filters and return to the full product list.

---

### Requirement 8: Dashboard

**User Story:** As a shopkeeper, I want a dashboard overview, so that I can immediately see the health of my inventory without navigating multiple screens.

#### Acceptance Criteria

1. THE Dashboard SHALL display the total number of products currently in inventory.
2. THE Dashboard SHALL display the count of products classified as "Low Stock".
3. THE Dashboard SHALL display the count of products classified as "Out of Stock".
4. THE Dashboard SHALL display the count of products classified as "Near Expiry".
5. THE Dashboard SHALL display the count of products classified as "Expired".
6. THE Dashboard SHALL list all active Alerts, each showing the product name, alert type, and the date the alert was generated.
7. WHEN a shopkeeper acknowledges an Alert on the Dashboard, THE SSIMS SHALL mark the alert as acknowledged and remove it from the active alerts list.

---

### Requirement 9: Notifications (Optional SMS/Email)

**User Story:** As a shopkeeper, I want to receive SMS or email notifications for critical alerts, so that I am informed even when I am not actively using the system.

#### Acceptance Criteria

1. WHERE SMS/Email notifications are enabled, THE SSIMS SHALL send a notification to the shopkeeper's registered contact when a "Low Stock", "Out of Stock", "Near Expiry", or "Expired" alert is generated.
2. WHERE SMS/Email notifications are enabled, THE SSIMS SHALL include the product name, alert type, and current stock level or expiry date in the notification message.
3. WHERE SMS/Email notifications are enabled, THE SSIMS SHALL allow a shopkeeper to enable or disable each notification channel (SMS, Email) independently.
4. IF a notification delivery attempt fails, THEN THE SSIMS SHALL retry delivery up to 3 times before logging the failure.

---

### Requirement 10: Reports and Analytics

**User Story:** As a shopkeeper, I want to view stock usage trends and expiry wastage reports, so that I can make informed purchasing and stocking decisions.

#### Acceptance Criteria

1. THE SSIMS SHALL generate a stock usage trend report showing quantity changes per product over a shopkeeper-selected date range.
2. THE SSIMS SHALL generate an expiry wastage report listing products that expired within a shopkeeper-selected date range, including the quantity wasted.
3. THE SSIMS SHALL identify and display the top 10 most frequently restocked products over a shopkeeper-selected date range.
4. WHEN a shopkeeper requests a report, THE SSIMS SHALL render the report within 2 seconds for data sets covering up to 12 months.
5. THE SSIMS SHALL allow a shopkeeper to export any report as a CSV file.

---

### Requirement 11: Performance and Availability

**User Story:** As a shopkeeper, I want the system to respond quickly and be available at all times, so that inventory management does not slow down shop operations.

#### Acceptance Criteria

1. THE SSIMS SHALL respond to any user interaction within 2 seconds under normal operating conditions.
2. THE SSIMS SHALL be available 24 hours a day, 7 days a week, with a target uptime of 99.5% per calendar month.
3. THE SSIMS SHALL support a product catalog of up to 100,000 products without degradation in search or filter response times beyond the 2-second limit.

---

### Requirement 12: Security

**User Story:** As a shopkeeper, I want the system to protect my inventory data, so that unauthorized parties cannot view or modify shop information.

#### Acceptance Criteria

1. THE SSIMS SHALL transmit all data between the client and server over HTTPS.
2. THE SSIMS SHALL enforce role-based access control, ensuring that unauthenticated requests to any protected endpoint receive a 401 Unauthorized response.
3. THE SSIMS SHALL sanitize all user-supplied input before persisting it to the database to prevent injection attacks.
4. THE SSIMS SHALL log all authentication events (successful login, failed login, session expiry) with a timestamp and source IP address.
