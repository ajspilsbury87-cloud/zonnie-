/**
 * Catches render errors in its subtree and shows a fallback UI instead of
 * letting the app die silently. Without this, a thrown error during render
 * unmounts the React tree and the user sees a blank screen / iOS kills the
 * process — exactly the symptom Andy reports as "the app crashed".
 *
 * Once we install Sentry or another crash reporter, hook into
 * `componentDidCatch` to forward the error + stack. For now: visible-only.
 */

import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useStrings } from '@/src/i18n/useStrings';
import { fonts, fontSizes, palette, radii, spacing } from '@/src/theme/tokens';

/** Function component for the error fallback so we can use hooks. */
function ErrorFallback({
  surface,
  message,
  onReset,
}: {
  surface?: string;
  message: string;
  onReset: () => void;
}) {
  const t = useStrings();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t.somethingWentWrong}</Text>
      {surface ? (
        <Text style={styles.surface}>in {surface}</Text>
      ) : null}
      <Text style={styles.message} numberOfLines={6}>
        {message}
      </Text>
      <Pressable
        onPress={onReset}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{t.tryAgain}</Text>
      </Pressable>
    </View>
  );
}

interface Props {
  children: ReactNode;
  /** Optional label shown alongside the error so we know which subtree blew up. */
  surface?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Surfaced via console for Metro logs and for any future crash reporter.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.surface ? `:${this.props.surface}` : ''}]`, error);
    // eslint-disable-next-line no-console
    console.error(info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          surface={this.props.surface}
          message={this.state.error.message}
          onReset={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: palette.sand,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xl,
    color: palette.ink,
  },
  surface: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: fontSizes.md * 1.4,
  },
  button: {
    backgroundColor: palette.peach,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.white,
  },
});
