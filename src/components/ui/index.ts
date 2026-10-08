// KIMS Parking (mobile) — UI primitives kit.
//
// The RN sibling of the web app's components/ui. Same vocabulary, platform-
// correct implementations, built on the elevation / motion / type tokens in
// theme/tokens.ts. Screens compose from these instead of re-declaring card
// shadows, stat tiles and empty states inline.

export {AppText} from './Text';
export {Surface} from './Surface';
export {SectionHeader} from './SectionHeader';
export {Divider} from './Divider';
export {Avatar} from './Avatar';
export {IconButton} from './IconButton';
export {StatTile} from './StatTile';
export {EmptyState} from './EmptyState';
export {Chip} from './Chip';
export {SegmentedControl} from './SegmentedControl';
export type {Segment} from './SegmentedControl';
export {ProgressBar} from './ProgressBar';

// Re-exported from the existing component set so the kit is one import.
export {Button} from '../Button';
export {Card} from '../Card';
export {Badge} from '../Badge';
export {SkeletonBlock, SkeletonCard} from '../Skeleton';
