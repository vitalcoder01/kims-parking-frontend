import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, Linking, ActivityIndicator, Platform} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {PressableScale} from './PressableScale';
import {useTheme} from '../context/ThemeContext';
import {appApi} from '../services/api';
import {Icon} from './Icon';
import {APP_VERSION_CODE, APP_VERSION_NAME} from '../config/version';

type UpdateInfo = {latestVersionCode: number; latestVersionName: string; apkUrl: string; notes?: string};
type GateState = {status: 'checking'} | {status: 'ok'} | {status: 'blocked'; info: UpdateInfo};
type DownloadState = {phase: 'idle'} | {phase: 'downloading'; pct: number; attempt: number} | {phase: 'error'; message: string};

const MAX_DOWNLOAD_ATTEMPTS = 2;

// Downloads the update APK via Android's own DownloadManager (not a raw
// in-process fetch) and hands the result straight to the package installer —
// no trip through the browser to fetch it, then hunting it down in Downloads
// to open it.
//
// This used to be a plain OkHttp fetch, retried in JS up to 3 times on
// "Download interrupted." (the library's byte-count check — bytesDownloaded
// !== contentLength — after the stream broke mid-transfer). That still hit
// the same error on a ~68MB download over a weak connection even across
// retries, because every retry started the ~68MB file over from byte zero:
// three shots at completing the whole thing in one uninterrupted go is still
// just one shot at a connection that stays up that long.
//
// DownloadManager is the actual fix, not another retry: it's a system
// service built exactly for "large file, may take a while, may drop and
// reconnect" — it resumes a broken transfer with an HTTP Range request
// instead of restarting (the release APK host serves `Accept-Ranges:
// bytes`), and it keeps running even if this app is backgrounded or the
// screen locks mid-download, neither of which a raw fetch survived.
async function downloadOnce(
  apkUrl: string,
  latestVersionName: string,
  onProgress: (pct: number) => void,
) {
  const {config, fs} = ReactNativeBlobUtil;
  // addAndroidDownloads requires a path outside CacheDir/DocumentDir — this
  // is the app's own external-files "Download" folder, which (unlike the
  // public Downloads directory) needs no storage permission on any modern
  // Android version.
  const targetPath = `${fs.dirs.DownloadDir}/kims-parking-update.apk`;
  // DownloadManager errors out if the destination already exists — clear out
  // whatever a previous attempt (or a previous version's update) left behind.
  if (await fs.exists(targetPath)) await fs.unlink(targetPath).catch(() => {});
  const res = await config({
    addAndroidDownloads: {
      useDownloadManager: true,
      notification: true,
      title: 'KIMS Parking Update',
      description: `Downloading version ${latestVersionName}`,
      mime: 'application/vnd.android.package-archive',
      path: targetPath,
    },
  })
    .fetch('GET', apkUrl)
    .progress((received: string, total: string) => {
      const r = Number(received), t = Number(total);
      if (t > 0) onProgress(r / t);
    });
  // Deliberately NO chooser title: the library's chooser branch wraps the
  // intent in Intent.createChooser, which drops FLAG_ACTIVITY_NEW_TASK and
  // throws from a non-Activity context (patched in
  // patches/react-native-blob-util+*.patch as belt-and-braces, alongside
  // making the codegen spec accept null here — the unpatched spec typed
  // chooserTitle as a non-nullable string, so BOTH the two-arg and
  // three-arg forms of this call failed on the New Architecture, each in a
  // different way). Omitting the title goes straight to the package
  // installer with the flags intact.
  await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/vnd.android.package-archive');
}

async function downloadAndInstall(
  apkUrl: string,
  latestVersionName: string,
  onProgress: (pct: number, attempt: number) => void,
) {
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    onProgress(0, attempt); // immediate feedback that a (re)try has started, before the first progress tick arrives
    try {
      await downloadOnce(apkUrl, latestVersionName, pct => onProgress(pct, attempt));
      return;
    } catch (err) {
      // A genuine DownloadManager failure (STATUS_FAILED — bad storage
      // state, host rejected the request, etc.) rather than the old
      // mid-transfer symptom DownloadManager itself now absorbs. Worth one
      // retry since the underlying cause is still usually transient, but not
      // worth the 3 attempts the old restart-from-scratch retry needed.
      if (attempt === MAX_DOWNLOAD_ATTEMPTS) throw err;
    }
  }
}

// Replaces the app's entire content — not an overlay on top of it — until
// the version check has actually resolved. A Modal rendered as a SIBLING of
// the login screen (the previous approach) left a real window where the
// login screen was mounted and interactive while the check was still
// in-flight; a stale build could complete a login before the modal ever
// appeared. Nothing here (including the login screen) mounts until this
// gate has confirmed the installed build is current.
export function UpdateGate({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const [state, setState] = useState<GateState>({status: 'checking'});
  const [download, setDownload] = useState<DownloadState>({phase: 'idle'});

  useEffect(() => {
    let cancelled = false;
    appApi.checkVersion()
      .then(data => {
        if (cancelled) return;
        setState(data.latestVersionCode > APP_VERSION_CODE ? {status: 'blocked', info: data} : {status: 'ok'});
      })
      .catch(() => {
        // No connectivity yet / backend briefly down — fail OPEN rather than
        // bricking the app on a network hiccup. The check re-runs every
        // launch, so a real update still reaches everyone quickly once
        // connectivity is back.
        if (!cancelled) setState({status: 'ok'});
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'checking') {
    return (
      <View style={[s.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (state.status === 'ok') return <>{children}</>;

  const {info} = state;

  const handlePress = async () => {
    if (Platform.OS !== 'android') {
      // No in-app installer path off Android (App Store builds don't ship
      // sideloaded APKs) — keep the old browser hand-off there.
      Linking.openURL(info.apkUrl);
      return;
    }
    setDownload({phase: 'downloading', pct: 0, attempt: 1});
    try {
      await downloadAndInstall(info.apkUrl, info.latestVersionName, (pct, attempt) => setDownload({phase: 'downloading', pct, attempt}));
      // Once the installer screen is up, this component may keep rendering
      // behind it (the user hasn't left the app) — reset so a cancelled
      // install can be retried without looking stuck at 100%.
      setDownload({phase: 'idle'});
    } catch (err: any) {
      // Surfaced on screen (not just logged) so a real-device failure can be
      // read/screenshotted directly — the previous silent catch here made
      // every distinct failure mode look identical and undiagnosable.
      const message = err?.message || err?.description || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Unknown error';
      setDownload({phase: 'error', message});
    }
  };

  const downloading = download.phase === 'downloading';
  const pct = download.phase === 'downloading' ? Math.round(download.pct * 100) : 0;

  return (
    <View style={[s.center, {backgroundColor: colors.background}]}>
      <View style={[s.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
        <View style={[s.iconWrap, {backgroundColor: colors.primaryLight}]}>
          <Icon name="rocket" size={26} color={colors.primary} />
        </View>
        <Text style={[s.title, {color: colors.textPrimary}]}>Update Required</Text>
        <Text style={[s.sub, {color: colors.textSecondary}]}>
          Version {info.latestVersionName} is required to continue — you're on {APP_VERSION_NAME}.
        </Text>
        {info.notes ? (
          <Text style={[s.notes, {color: colors.textMuted, backgroundColor: colors.cardAlt}]}>{info.notes}</Text>
        ) : null}
        {download.phase === 'error' && (
          <>
            <Text style={[s.errorTxt, {color: colors.error}]}>
              Couldn't download the update in-app — tap below to open it in your browser instead.
            </Text>
            <Text style={[s.errorDetail, {color: colors.textMuted, backgroundColor: colors.cardAlt}]} selectable>
              {download.message}
            </Text>
          </>
        )}
        {downloading ? (
          <>
            <View style={[s.progressTrack, {backgroundColor: colors.cardAlt}]}>
              <View style={[s.progressFill, {backgroundColor: colors.primary, width: `${Math.max(pct, 4)}%`}]} />
              <Text style={[s.progressTxt, {color: colors.textPrimary}]}>{pct}%</Text>
            </View>
            {download.phase === 'downloading' && download.attempt > 1 && (
              <Text style={[s.errorDetail, {color: colors.textMuted, backgroundColor: 'transparent', paddingHorizontal: 0}]}>
                Download failed to start — retrying (attempt {download.attempt} of {MAX_DOWNLOAD_ATTEMPTS})…
              </Text>
            )}
          </>
        ) : (
          <PressableScale
            style={[s.cta, {backgroundColor: colors.primary, shadowColor: colors.primary}]}
            onPress={download.phase === 'error' ? () => Linking.openURL(info.apkUrl) : handlePress}>
            <Text style={s.ctaTxt}>{download.phase === 'error' ? 'Open in Browser' : 'Download & Install'}</Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  card: {width: '100%', maxWidth: 360, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center'},
  iconWrap: {width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  title: {fontSize: 19, fontWeight: '900'},
  sub: {fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19},
  notes: {fontSize: 12, borderRadius: 12, padding: 12, marginTop: 14, lineHeight: 17, alignSelf: 'stretch'},
  errorTxt: {fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 17},
  errorDetail: {fontSize: 11, textAlign: 'left', marginTop: 8, lineHeight: 15, borderRadius: 10, padding: 10, alignSelf: 'stretch', fontFamily: Platform.OS === 'android' ? 'monospace' : undefined},
  cta: {
    marginTop: 20, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center',
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  progressTrack: {
    marginTop: 20, borderRadius: 14, height: 46, alignSelf: 'stretch', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  progressFill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 14},
  progressTxt: {fontSize: 13, fontWeight: '800'},
  ctaTxt: {color: '#fff', fontSize: 14, fontWeight: '900'},
});
