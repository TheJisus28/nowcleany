// API views, read with fromJson. Only the fields the app shows.

typedef Json = Map<String, dynamic>;

double? _toDouble(Object? value) => value is num ? value.toDouble() : null;

class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.fullName,
    required this.roles,
    required this.permissions,
  });

  factory UserProfile.fromJson(Json json) => UserProfile(
    id: json['id'] as String,
    email: json['email'] as String,
    fullName: json['fullName'] as String,
    roles: List<String>.from(json['roles'] as List? ?? const []),
    permissions: List<String>.from(json['permissions'] as List? ?? const []),
  );

  final String id;
  final String email;
  final String fullName;
  final List<String> roles;
  final List<String> permissions;

  bool can(String permission) => permissions.contains(permission);

  /// "Ana María Pérez" -> "AP".
  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts.first[0];
    final last = parts.length > 1 ? parts.last[0] : '';
    return (first + last).toUpperCase();
  }
}

class AuthResult {
  const AuthResult({required this.accessToken, required this.refreshToken, required this.user});

  factory AuthResult.fromJson(Json json) => AuthResult(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
    user: UserProfile.fromJson(json['user'] as Json),
  );

  final String accessToken;
  final String refreshToken;
  final UserProfile user;
}

class GeoPoint {
  const GeoPoint(this.latitude, this.longitude);

  factory GeoPoint.fromJson(Json json) =>
      GeoPoint((json['latitude'] as num).toDouble(), (json['longitude'] as num).toDouble());

  final double latitude;
  final double longitude;
}

class MapConfig {
  const MapConfig({required this.token, required this.center});

  factory MapConfig.fromJson(Json json) {
    final token = json['token'] as String?;
    return MapConfig(
      token: token == null || token.trim().isEmpty ? null : token,
      center: GeoPoint.fromJson(json['center'] as Json),
    );
  }

  final String? token;
  final GeoPoint center;
}

class Branch {
  const Branch({
    required this.id,
    required this.name,
    required this.address,
    required this.city,
    required this.phone,
    required this.latitude,
    required this.longitude,
    required this.isMain,
    required this.active,
  });

  factory Branch.fromJson(Json json) => Branch(
    id: json['id'] as String,
    name: json['name'] as String,
    address: json['address'] as String?,
    city: json['city'] as String?,
    phone: json['phone'] as String?,
    latitude: _toDouble(json['latitude']),
    longitude: _toDouble(json['longitude']),
    isMain: json['isMain'] as bool? ?? false,
    active: json['active'] as bool? ?? true,
  );

  final String id;
  final String name;
  final String? address;
  final String? city;
  final String? phone;
  final double? latitude;
  final double? longitude;
  final bool isMain;
  final bool active;

  bool get hasLocation => latitude != null && longitude != null;

  /// "Cra 5 # 20-10, Montería".
  String? get fullAddress {
    final parts = [address, city].where((p) => p != null && p.trim().isNotEmpty).cast<String>().toList();
    return parts.isEmpty ? null : parts.join(', ');
  }
}

class Customer {
  const Customer({
    required this.id,
    required this.documentType,
    required this.documentTypeLabel,
    required this.documentNumber,
    required this.name,
    required this.address,
    required this.phone,
    required this.city,
    required this.active,
    required this.branches,
  });

  factory Customer.fromJson(Json json) => Customer(
    id: json['id'] as String,
    documentType: json['documentType'] as String? ?? 'NIT',
    documentTypeLabel: json['documentTypeLabel'] as String? ?? (json['documentType'] as String? ?? 'NIT'),
    documentNumber: json['documentNumber'] as String? ?? '',
    name: json['name'] as String,
    address: json['address'] as String?,
    phone: json['phone'] as String?,
    city: json['city'] as String?,
    active: json['active'] as bool? ?? true,
    branches: [for (final branch in json['branches'] as List? ?? const []) Branch.fromJson(branch as Json)],
  );

  final String id;
  final String documentType;
  final String documentTypeLabel;
  final String documentNumber;
  final String name;
  final String? address;
  final String? phone;
  final String? city;
  final bool active;
  final List<Branch> branches;

  /// "NIT 900123456-7" or "Cédula 50912345".
  String get document => '$documentTypeLabel $documentNumber';

  List<Branch> get activeBranches => branches.where((b) => b.active).toList();
}

class VisitBranch {
  const VisitBranch({required this.id, required this.name, required this.address, required this.city});

  factory VisitBranch.fromJson(Json json) => VisitBranch(
    id: json['id'] as String,
    name: json['name'] as String,
    address: json['address'] as String?,
    city: json['city'] as String?,
  );

  final String id;
  final String name;
  final String? address;
  final String? city;
}

class OrderRef {
  const OrderRef({required this.id, required this.label});

  factory OrderRef.fromJson(Json json) => OrderRef(id: json['id'] as String, label: json['label'] as String);

  final String id;
  final String label;
}

class Visit {
  const Visit({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.branch,
    required this.visitedAt,
    required this.accuracyM,
    required this.distanceM,
    required this.onSite,
    required this.onSiteRadiusM,
    required this.notes,
    required this.order,
  });

  factory Visit.fromJson(Json json) {
    final customer = json['customer'] as Json;
    final order = json['order'] as Json?;
    return Visit(
      id: json['id'] as String,
      customerId: customer['id'] as String,
      customerName: customer['name'] as String,
      branch: VisitBranch.fromJson(json['branch'] as Json),
      visitedAt: DateTime.parse(json['visitedAt'] as String).toLocal(),
      accuracyM: _toDouble(json['accuracyM']),
      distanceM: _toDouble(json['distanceM']),
      onSite: json['onSite'] as bool?,
      onSiteRadiusM: _toDouble(json['onSiteRadiusM']) ?? 150,
      notes: json['notes'] as String?,
      order: order == null ? null : OrderRef.fromJson(order),
    );
  }

  final String id;
  final String customerId;
  final String customerName;
  final VisitBranch branch;
  final DateTime visitedAt;
  final double? accuracyM;
  final double? distanceM;
  final bool? onSite;
  final double onSiteRadiusM;
  final String? notes;
  final OrderRef? order;
}

class Product {
  const Product({required this.id, required this.code, required this.name, required this.stockUnit});

  factory Product.fromJson(Json json) => Product(
    id: json['id'] as String,
    code: json['code'] as String,
    name: json['name'] as String,
    stockUnit: json['stockUnit'] as String? ?? 'un',
  );

  final String id;
  final String code;
  final String name;
  final String stockUnit;
}

class OrderLine {
  const OrderLine({
    required this.productId,
    required this.productCode,
    required this.productName,
    required this.quantity,
    required this.unit,
  });

  factory OrderLine.fromJson(Json json) {
    final quantity = json['quantity'] as Json;
    return OrderLine(
      productId: json['productId'] as String,
      productCode: json['productCode'] as String? ?? '',
      productName: json['productName'] as String? ?? '',
      quantity: quantity['quantity'] as String,
      unit: quantity['unit'] as String? ?? 'un',
    );
  }

  final String productId;
  final String productCode;
  final String productName;

  /// Decimal string, as the API sends it.
  final String quantity;
  final String unit;
}

class SalesOrder {
  const SalesOrder({
    required this.id,
    required this.label,
    required this.status,
    required this.statusLabel,
    required this.customerId,
    required this.customerName,
    required this.branchId,
    required this.branchName,
    required this.branchAddress,
    required this.estimatedDeliveryDate,
    required this.notes,
    required this.createdAt,
    required this.lines,
  });

  factory SalesOrder.fromJson(Json json) {
    final customer = json['customer'] as Json;
    final branch = json['branch'] as Json?;
    return SalesOrder(
      id: json['id'] as String,
      label: json['label'] as String,
      status: json['status'] as String,
      statusLabel: json['statusLabel'] as String? ?? json['status'] as String,
      customerId: customer['id'] as String,
      customerName: customer['name'] as String,
      branchId: branch?['id'] as String?,
      branchName: branch?['name'] as String?,
      branchAddress: branch == null
          ? null
          : [branch['address'], branch['city']].whereType<String>().where((p) => p.trim().isNotEmpty).join(', '),
      estimatedDeliveryDate: json['estimatedDeliveryDate'] as String?,
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      lines: [for (final line in json['lines'] as List? ?? const []) OrderLine.fromJson(line as Json)],
    );
  }

  final String id;
  final String label;
  final String status;
  final String statusLabel;
  final String customerId;
  final String customerName;
  final String? branchId;
  final String? branchName;
  final String? branchAddress;
  final String? estimatedDeliveryDate;
  final String? notes;
  final DateTime createdAt;
  final List<OrderLine> lines;

  num get totalUnits => lines.fold<num>(0, (sum, line) => sum + (num.tryParse(line.quantity) ?? 0));

  bool get isDraft => status == 'DRAFT';

  /// The status as the seller says it (the office steps stay out of the app).
  String get sellerStatus => switch (status) {
    'DRAFT' => 'Borrador',
    'CONFIRMED' => 'Guardada',
    'INVOICED' => 'Facturada',
    'READY' || 'PARTIAL' => 'En despacho',
    'DISPATCHED' => 'Despachada',
    'DELIVERED' => 'Entregada',
    'CANCELLED' => 'Anulada',
    _ => statusLabel,
  };
}
