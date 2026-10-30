import 'api_client.dart';
import 'models.dart';

/// The API endpoints the seller app uses.
class SellersApi {
  SellersApi(this.client);

  final ApiClient client;
  List<Product>? _products;

  Future<MapConfig> mapConfig() async => MapConfig.fromJson(await client.get('/v1/maps/config') as Json);

  /// The seller's portfolio (the API only returns their customers).
  Future<List<Customer>> customers({String? search}) async {
    final q = search?.trim();
    final data = await client.get('/v1/customers', query: q == null || q.isEmpty ? null : {'q': q}) as List;
    return [for (final item in data) Customer.fromJson(item as Json)];
  }

  Future<Customer> customer(String id) async => Customer.fromJson(await client.get('/v1/customers/$id') as Json);

  Future<Visit> recordVisit({
    required String customerId,
    required String branchId,
    required double latitude,
    required double longitude,
    double? accuracy,
    String? notes,
  }) async {
    final data = await client.post(
      '/v1/visits',
      body: {
        'customerId': customerId,
        'branchId': branchId,
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': ?accuracy,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
      },
    );
    return Visit.fromJson(data as Json);
  }

  /// Own visits between two dates (inclusive), most recent first.
  Future<List<Visit>> visits({required String from, required String to}) async {
    final data = await client.get('/v1/visits', query: {'from': from, 'to': to}) as List;
    return [for (final item in data) Visit.fromJson(item as Json)];
  }

  /// Active finished goods, loaded once per session.
  Future<List<Product>> finishedProducts({bool reload = false}) async {
    final cached = _products;
    if (cached != null && !reload) return cached;
    final data = await client.get('/v1/products', query: {'type': 'FINISHED_GOOD', 'active': 'true'}) as List;
    final products = [for (final item in data) Product.fromJson(item as Json)]
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return _products = products;
  }

  Future<SalesOrder> createOrder({
    required String customerId,
    required String branchId,
    String? visitId,
    String? estimatedDeliveryDate,
    String? notes,
    required Map<String, int> quantities,
  }) async {
    final data = await client.post(
      '/v1/sales-orders',
      body: {
        'customerId': customerId,
        'branchId': branchId,
        'visitId': ?visitId,
        'estimatedDeliveryDate': ?estimatedDeliveryDate,
        if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        'lines': [
          for (final entry in quantities.entries) {'productId': entry.key, 'quantity': entry.value.toString()},
        ],
      },
    );
    return SalesOrder.fromJson(data as Json);
  }

  Future<SalesOrder> confirmOrder(String id) async =>
      SalesOrder.fromJson(await client.post('/v1/sales-orders/$id/confirm') as Json);

  /// Own sales orders, newest first.
  Future<List<SalesOrder>> orders() async {
    final data = await client.get('/v1/sales-orders', query: {'limit': '100'}) as List;
    return [for (final item in data) SalesOrder.fromJson(item as Json)];
  }

  void clearCache() => _products = null;
}
