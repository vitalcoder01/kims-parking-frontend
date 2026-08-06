import React, {useRef, useState} from 'react';
import {View, ScrollView, ScrollViewProps, StyleProp, ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface Props extends Omit<ScrollViewProps, 'horizontal' | 'showsHorizontalScrollIndicator' | 'style'> {
  // The screen's background colour the row sits on — the fade has to match
  // it exactly (transparent -> this colour) or the edge reads as a visible
  // seam instead of a soft cutoff.
  fadeColor: string;
  // Applied to the WRAPPING View, not the ScrollView — this is what carries
  // any full-bleed negative margin (e.g. marginHorizontal: -20) so the fade
  // lines up with the real screen edge rather than the un-bled content box.
  wrapStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// A horizontal ScrollView with every native scroll affordance deliberately
// hidden (showsHorizontalScrollIndicator={false} everywhere in this app, to
// dodge Android's scrollbar-bleed quirk) left these rows with NO visual cue
// that there was more content off-screen — Driver Status, the Dashboard
// category row, and the Jobs stage-filter chips all looked like complete,
// fixed lists even when several items were cut off. This adds a soft
// right-edge fade whenever the row actually overflows its width, and hides
// it again once scrolled to the end (nothing left to hint at).
export function HScrollHint({fadeColor, wrapStyle, style, contentContainerStyle, children, ...rest}: Props) {
  const [scrollable, setScrollable] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const containerWidth = useRef(0);

  return (
    <View style={[{position: 'relative', overflow: 'hidden'}, wrapStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        style={style}
        contentContainerStyle={contentContainerStyle}
        onLayout={e => { containerWidth.current = e.nativeEvent.layout.width; }}
        onContentSizeChange={w => setScrollable(w > containerWidth.current + 1)}
        onScroll={e => {
          const {contentOffset, contentSize, layoutMeasurement} = e.nativeEvent;
          setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 4);
        }}
        scrollEventThrottle={32}
        {...rest}>
        {children}
      </ScrollView>
      {scrollable && !atEnd && (
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', fadeColor]}
          start={{x: 0, y: 0}} end={{x: 1, y: 0}}
          style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: 32}}
        />
      )}
    </View>
  );
}
