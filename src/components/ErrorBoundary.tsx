import React from 'react';
import {View, Text, StyleSheet, ScrollView, Pressable} from 'react-native';
import {report} from '../services/crashReporting';

/*
 * Catches render-time exceptions so one broken screen stops taking the whole
 * app down.
 *
 * The web app had no boundary anywhere, and the cost of that was concrete:
 * a hook stranded below an early return produced a blank white screen with
 * no message, no stack and no way back — identical to every other render
 * fault, and undiagnosable until someone photographed it. Mobile had exactly
 * the same gap, where it is worse: a React Native app whose root unmounts
 * shows a bare screen with no browser console to fall back on and no way to
 * reload short of killing the process.
 *
 * Two jobs. The person holding the phone gets something that explains itself
 * and a way out. The fault gets reported (see crashReporting) so it reaches
 * you in seconds instead of when a valet complains.
 *
 * What it cannot catch: event handlers, async callbacks, anything inside
 * setTimeout. React boundaries only see render, lifecycle and constructors.
 * Those paths are covered by the ErrorUtils global handler installed
 * alongside this — which is why a boundary on its own was never enough.
 */

interface Props {
  children: React.ReactNode;
  /** Shown above the message. Defaults to a generic line. */
  label?: string;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null, componentStack: null};

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {error};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Straight to the reporter; it scrubs and dedupes and never throws.
    report(error);
    this.setState({componentStack: info.componentStack ?? null});
  }

  private reset = () => this.setState({error: null, componentStack: null});

  render() {
    const {error, componentStack} = this.state;
    if (!error) return this.props.children;

    /*
     * Fixed colours, no theme hook, no shared components.
     *
     * This renders precisely when something has already gone wrong, so it
     * must not depend on any of the app's own providers still being healthy.
     * A crash screen that itself needs ThemeContext is a crash screen that
     * disappears exactly when ThemeContext is the thing that broke.
     */
    return (
      <View style={s.root}>
        <Text style={s.title}>{this.props.label ?? 'Something went wrong on this screen'}</Text>
        <Text style={s.sub}>
          The rest of the app is still running. Going back usually works — this has already been
          reported.
        </Text>

        <ScrollView style={s.box} contentContainerStyle={s.boxInner}>
          <Text style={s.mono}>
            {error.name}: {error.message}
            {componentStack ? `\n${componentStack.split('\n').slice(0, 12).join('\n')}` : ''}
          </Text>
        </ScrollView>

        <Pressable style={s.btn} onPress={this.reset}>
          <Text style={s.btnTxt}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const s = StyleSheet.create({
  root: {flex: 1, padding: 24, gap: 14, backgroundColor: '#14151A', justifyContent: 'center'},
  title: {fontSize: 18, fontWeight: '800', color: '#F2F3F5'},
  sub: {fontSize: 13, lineHeight: 19, color: '#A8ADB8'},
  box: {maxHeight: 260, borderRadius: 10, borderWidth: 1, borderColor: '#2A2C33', backgroundColor: '#0C0D10'},
  boxInner: {padding: 12},
  mono: {fontSize: 12, lineHeight: 17, color: '#FF8A80', fontFamily: 'monospace'},
  btn: {alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F2F3F5'},
  btnTxt: {fontSize: 13, fontWeight: '800', color: '#14151A'},
});
