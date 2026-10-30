import 'package:flutter/material.dart';

import 'theme.dart';

/// The NOW CLEANY mark: a drop in an aqua tile plus the name.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44, this.light = true, this.subtitle});

  final double size;
  final bool light;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final color = light ? Colors.white : BrandColors.navy;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: BrandColors.aqua, borderRadius: BorderRadius.circular(size * 0.3)),
          child: Icon(Icons.water_drop_rounded, color: BrandColors.navy, size: size * 0.58),
        ),
        SizedBox(width: size * 0.3),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'NOW CLEANY',
              style: TextStyle(color: color, fontSize: size * 0.42, fontWeight: FontWeight.w800, letterSpacing: 1.2),
            ),
            if (subtitle != null)
              Text(
                subtitle!,
                style: TextStyle(
                  color: light ? BrandColors.aqua : BrandColors.muted,
                  fontSize: size * 0.28,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(width: 32, height: 32, child: CircularProgressIndicator(strokeWidth: 3)),
          if (label != null) ...[
            const SizedBox(height: 16),
            Text(label!, style: const TextStyle(color: BrandColors.muted)),
          ],
        ],
      ),
    );
  }
}

/// Centered message for the empty and error states, with an optional action.
class MessageView extends StatelessWidget {
  const MessageView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.tone = MessageTone.neutral,
  });

  /// Error state with "Reintentar".
  factory MessageView.error(String message, {required VoidCallback onRetry}) => MessageView(
    icon: Icons.cloud_off_rounded,
    title: 'No pudimos cargar la información',
    message: message,
    actionLabel: 'Reintentar',
    onAction: onRetry,
    tone: MessageTone.error,
  );

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final MessageTone tone;

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = switch (tone) {
      MessageTone.error => (BrandColors.danger, BrandColors.dangerSoft),
      MessageTone.neutral => (BrandColors.navy, BrandColors.aquaSoft),
    };
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
              child: Icon(icon, size: 34, color: fg),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.muted, height: 1.4)),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: onAction,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum MessageTone { neutral, error }

/// Small colored label: "En sitio", "Confirmada"...
class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, required this.foreground, required this.background, this.icon});

  final String label;
  final Color foreground;
  final Color background;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: 4)],
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

/// Icon + text row for details (address, phone...).
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.text, this.muted = false});

  final IconData icon;
  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: BrandColors.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: muted ? BrandColors.muted : BrandColors.ink, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}

/// Uppercase small header for list sections.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});

  final String text;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: BrandColors.navy,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
          ),
          if (trailing != null)
            Text(trailing!, style: const TextStyle(color: BrandColors.muted, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// White bar pinned to the bottom of a screen with its main action(s).
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: BrandColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: SizedBox(width: double.infinity, child: child),
        ),
      ),
    );
  }
}
