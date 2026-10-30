// Spanish (Colombia) formatting by hand: the demo carries no intl dependency.

const _weekdays = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const _months = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const _shortMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/// Meters below 1 km ("35 m"), otherwise km with a decimal comma ("1,2 km").
String formatDistance(num meters) {
  if (meters < 1000) return '${meters.round()} m';
  final km = meters / 1000;
  final text = km >= 100 ? km.round().toString() : km.toStringAsFixed(1).replaceAll('.', ',');
  return '$text km';
}

/// Integer with thousands separated by dots ("1.200"); decimals with a comma.
String formatNumber(num value) {
  final negative = value < 0;
  final abs = value.abs();
  final whole = abs.truncate();
  final fraction = abs - whole;
  final digits = whole.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  var text = buffer.toString();
  if (fraction > 0.0001) {
    final decimals = fraction.toStringAsFixed(2).substring(2).replaceAll(RegExp(r'0+$'), '');
    if (decimals.isNotEmpty) text = '$text,$decimals';
  }
  return negative ? '-$text' : text;
}

/// API decimal string ("120", "2.5") to a number for display; 0 when it does not parse.
num parseDecimal(String value) => num.tryParse(value) ?? 0;

/// YYYY-MM-DD, as the API expects dates.
String isoDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

/// Parses a YYYY-MM-DD date as a local calendar date.
DateTime? parseIsoDate(String? value) {
  if (value == null || value.length < 10) return null;
  final parts = value.substring(0, 10).split('-');
  if (parts.length != 3) return null;
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) return null;
  return DateTime(year, month, day);
}

DateTime dateOnly(DateTime value) => DateTime(value.year, value.month, value.day);

/// "29 oct 2026", or "29 oct" within the current year.
String formatShortDate(DateTime date) {
  final now = DateTime.now();
  final base = '${date.day} ${_shortMonths[date.month - 1]}';
  return date.year == now.year ? base : '$base ${date.year}';
}

/// "miércoles 29 de octubre".
String formatLongDate(DateTime date) => '${_weekdays[date.weekday - 1]} ${date.day} de ${_months[date.month - 1]}';

/// Header for a group of visits: "Hoy", "Ayer" or the long date.
String formatDayHeader(DateTime day) {
  final today = dateOnly(DateTime.now());
  final difference = today.difference(dateOnly(day)).inDays;
  if (difference == 0) return 'Hoy';
  if (difference == 1) return 'Ayer';
  final text = formatLongDate(day);
  return text[0].toUpperCase() + text.substring(1);
}

/// "3:45 p. m."
String formatTime(DateTime time) {
  final hour12 = time.hour % 12 == 0 ? 12 : time.hour % 12;
  final suffix = time.hour < 12 ? 'a. m.' : 'p. m.';
  return '$hour12:${time.minute.toString().padLeft(2, '0')} $suffix';
}

/// Short label for a stock unit.
String unitLabel(String unit) => switch (unit) {
  'un' => 'und.',
  _ => unit,
};
