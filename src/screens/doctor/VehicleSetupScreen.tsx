import React, {useRef, useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, StatusBar, Dimensions, Modal, Pressable, ActivityIndicator} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {usersApi} from '../../services/api';
import {Icon} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';

// Loaded off a CDN inside the WebView, exactly the same technique already
// used by LiveTrackingScreen for its Leaflet map — no native 3D dependency,
// no pod install, reuses infrastructure already proven to work in this app.
//
// The car geometry/materials below are a plain-JS port of a React-DOM
// Three.js component (buildMiniCar / makeShadowBlob) — the React wrapper,
// sprite-baking, and demo-page parts of that component don't apply here
// (no DOM/ResizeObserver in React Native), but the actual scene-building
// functions are ordinary THREE + `document` calls, which run fine inside
// a WebView's own document.
function buildCarSceneHTML(initialColor: string, initialPlate: string, bg: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; }
  html, body, #scene { width: 100%; height: 100%; background: ${bg}; overflow: hidden; }
</style>
</head>
<body>
<div id="scene"></div>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
<script>
  function setSRGB(renderer) {
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else renderer.outputEncoding = THREE.sRGBEncoding;
  }

  function buildMiniCar(colour) {
    var car = new THREE.Group();

    var paint = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colour),
      metalness: 0.2, roughness: 0.3,
      clearcoat: 1.0, clearcoatRoughness: 0.06,
    });
    var glass = new THREE.MeshPhysicalMaterial({
      color: 0x11181d, metalness: 0.9, roughness: 0.1,
      clearcoat: 1.0, clearcoatRoughness: 0.05,
    });
    var darkMatte = new THREE.MeshStandardMaterial({color: 0x14151a, roughness: 0.95});
    var innerDark = new THREE.MeshStandardMaterial({color: 0x0f1013, roughness: 1, side: THREE.DoubleSide});
    var tireMat = new THREE.MeshStandardMaterial({color: 0x121212, roughness: 0.9});
    var rimMat  = new THREE.MeshStandardMaterial({color: 0xd9dde2, metalness: 0.9, roughness: 0.25});

    var s = new THREE.Shape();
    s.moveTo(-2.30, 0.30);
    s.lineTo(-2.42, 0.52);
    s.quadraticCurveTo(-2.46, 0.74, -2.16, 0.80);
    s.quadraticCurveTo(-1.20, 0.94, -0.40, 0.96);
    s.lineTo(1.10, 1.00);
    s.quadraticCurveTo(1.90, 1.00, 2.22, 0.88);
    s.quadraticCurveTo(2.44, 0.80, 2.40, 0.55);
    s.lineTo(2.32, 0.30);
    s.lineTo(1.81, 0.30);
    s.absarc(1.35, 0.30, 0.46, 0, Math.PI, false);
    s.lineTo(-0.89, 0.30);
    s.absarc(-1.35, 0.30, 0.46, 0, Math.PI, false);
    s.closePath();

    var bodyGeo = new THREE.ExtrudeGeometry(s, {
      depth: 1.6, steps: 1, curveSegments: 22,
      bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3,
    });
    bodyGeo.translate(0, 0, -0.8);
    car.add(new THREE.Mesh(bodyGeo, paint));

    var sill = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 1.5), darkMatte);
    sill.position.set(0, 0.31, 0);
    car.add(sill);

    var g = new THREE.Shape();
    g.moveTo(-0.95, 0.92);
    g.lineTo(-0.30, 1.44);
    g.quadraticCurveTo(0.15, 1.51, 0.62, 1.47);
    g.lineTo(1.55, 0.92);
    g.closePath();
    var canopyGeo = new THREE.ExtrudeGeometry(g, {
      depth: 1.34, steps: 1, curveSegments: 14,
      bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2,
    });
    canopyGeo.translate(0, 0, -0.67);
    car.add(new THREE.Mesh(canopyGeo, glass));

    var fin = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 10), darkMatte);
    fin.scale.set(2.2, 1, 1); fin.rotation.z = -0.5; fin.position.set(1.02, 1.28, 0);
    car.add(fin);

    [-1.35, 1.35].forEach(function(x) {
      var liner = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.5, 22, 1, true), innerDark);
      liner.rotation.x = Math.PI / 2;
      liner.position.set(x, 0.3, 0);
      car.add(liner);
    });

    [[-1.35, 0.74], [-1.35, -0.74], [1.35, 0.74], [1.35, -0.74]].forEach(function(p) {
      var x = p[0], z = p[1];
      var w = new THREE.Group();
      var tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 26), tireMat);
      tire.rotation.x = Math.PI / 2;
      w.add(tire);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.045, 10, 22), rimMat);
      ring.position.z = 0.055;
      w.add(ring);
      for (var i = 0; i < 5; i++) {
        var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.045), rimMat);
        spoke.rotation.z = (i / 5) * Math.PI * 2;
        spoke.position.z = 0.055;
        w.add(spoke);
      }
      var backing = new THREE.Mesh(new THREE.CircleGeometry(0.43, 22), innerDark);
      backing.position.z = -0.145;
      w.add(backing);
      w.position.set(x, 0.35, z);
      if (z < 0) w.rotation.y = Math.PI;
      car.add(w);
    });

    [0.5, -0.5].forEach(function(z) {
      var lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.09, 0.42),
        new THREE.MeshStandardMaterial({color: 0xfffdf2, emissive: 0xfff3cc, emissiveIntensity: 1.0, roughness: 0.3})
      );
      lamp.position.set(-2.41, 0.71, z);
      lamp.rotation.y = z > 0 ? -0.12 : 0.12;
      car.add(lamp);
    });

    var tailL = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.07, 1.34),
      new THREE.MeshStandardMaterial({color: 0xff3344, emissive: 0xff1e33, emissiveIntensity: 1.3, roughness: 0.35})
    );
    tailL.position.set(2.4, 0.8, 0);
    car.add(tailL);

    var grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.95), darkMatte);
    grille.position.set(-2.42, 0.42, 0);
    car.add(grille);

    [0.88, -0.88].forEach(function(z) {
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.16), paint);
      head.position.set(-0.58, 1.02, z);
      car.add(head);
    });

    return {group: car, paint: paint};
  }

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(4.2, 2.6, 5.2);
  camera.lookAt(0, 0.4, 0);

  var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  setSRGB(renderer);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('scene').appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f99a3, 0.95));
  var key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(5, 8, 4);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0xcfe0ff, 0.35);
  rim.position.set(-6, 4, -6);
  scene.add(rim);

  var carApi = buildMiniCar('${initialColor}');
  var car = carApi.group;
  car.rotation.y = 0.6;
  scene.add(car);

  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshStandardMaterial({color: 0x000000, transparent: true, opacity: 0.08})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  scene.add(ground);

  // Number plate — a canvas texture redrawn whenever the vehicle number
  // changes, mounted on the front bumper (the headlights/grille sit at
  // x ≈ -2.42, so the plate sits just outside that).
  var plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256; plateCanvas.height = 64;
  var plateCtx = plateCanvas.getContext('2d');
  var plateTex = new THREE.CanvasTexture(plateCanvas);
  function drawPlate(text) {
    plateCtx.fillStyle = '#f5f5f0';
    plateCtx.fillRect(0, 0, 256, 64);
    plateCtx.strokeStyle = '#111';
    plateCtx.lineWidth = 4;
    plateCtx.strokeRect(4, 4, 248, 56);
    plateCtx.fillStyle = '#111';
    plateCtx.font = 'bold 34px monospace';
    plateCtx.textAlign = 'center';
    plateCtx.textBaseline = 'middle';
    plateCtx.fillText(text || 'YOUR CAR', 128, 34);
    plateTex.needsUpdate = true;
  }
  drawPlate('${initialPlate}');
  var plateMat = new THREE.MeshBasicMaterial({map: plateTex});
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), plateMat);
  plate.position.set(-2.46, 0.34, 0);
  plate.rotation.y = -Math.PI / 2;
  car.add(plate);

  function setColor(hex) {
    carApi.paint.color.set(hex);
  }

  function onMessage(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.type === 'setColor') setColor(data.color);
      if (data.type === 'setPlate') drawPlate(data.plate);
    } catch (err) {}
  }
  document.addEventListener('message', onMessage);
  window.addEventListener('message', onMessage);

  function animate() {
    requestAnimationFrame(animate);
    car.rotation.y += 0.006;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
</script>
</body>
</html>`;
}

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 14;
const GRID_COLS = 4;
// The main page's grid sits inside the scroll view's 20px padding; the
// modal's grid sits inside overlay padding (24) + card padding (20) on
// each side, so it needs its own column width or the row would overflow.
const SWATCH_COL_W = (SCREEN_W - 20 * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const MODAL_SWATCH_COL_W = (Math.min(SCREEN_W, 420) - (24 + 20) * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

// Exactly 7 defaults + the "More" tile fills two full rows of 4.
const COLORS = [
  {name: 'White',  hex: '#FFFFFF'},
  {name: 'Black',  hex: '#1C1C1E'},
  {name: 'Red',    hex: '#DC2626'},
  {name: 'Blue',   hex: '#2563EB'},
  {name: 'Silver', hex: '#9CA3AF'},
  {name: 'Grey',   hex: '#4B5563'},
  {name: 'Green',  hex: '#16A34A'},
];

const MORE_COLORS = [
  {name: 'Yellow',  hex: '#F5B300'},
  {name: 'Orange',  hex: '#EA580C'},
  {name: 'Maroon',  hex: '#7C2D12'},
  {name: 'Navy',    hex: '#1E3A8A'},
  {name: 'Purple',  hex: '#7C3AED'},
  {name: 'Teal',    hex: '#0D9488'},
  {name: 'Pink',    hex: '#DB2777'},
  {name: 'Lime',    hex: '#65A30D'},
  {name: 'Beige',   hex: '#D6C7A1'},
  {name: 'Bronze',  hex: '#92553A'},
  {name: 'Sky',     hex: '#0EA5E9'},
];

function isLightColor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 175;
}

export function VehicleSetupScreen() {
  const dialog = useDialog();
  const {colors, isDark} = useTheme();
  const {user, updateProfile} = useAuth();
  const navigation = useNavigation<any>();
  const webRef = useRef<any>(null);
  const phoneRef = useRef<TextInput>(null);
  const [vehicleNumber, setVehicleNumber] = useState(user?.carNumber ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [selectedColor, setSelectedColor] = useState(COLORS[1].hex);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Already saved a vehicle number before -> land on the summary view
  // instead of re-asking for the same details every time this tab opens;
  // "Edit" is the only way back into the form.
  const [mode, setMode] = useState<'view' | 'edit'>(user?.carNumber ? 'view' : 'edit');

  const colorStorageKey = `@vehicle_color_${user?.id ?? 'anon'}`;

  // The backend has no body-colour column — it's a purely cosmetic touch
  // for the 3D preview, so it's kept locally per account instead.
  useEffect(() => {
    AsyncStorage.getItem(colorStorageKey).then(saved => {
      if (saved) setSelectedColor(saved);
    });
  }, [colorStorageKey]);

  useEffect(() => {
    webRef.current?.postMessage(JSON.stringify({type: 'setColor', color: selectedColor}));
  }, [selectedColor]);

  useEffect(() => {
    webRef.current?.postMessage(JSON.stringify({type: 'setPlate', plate: vehicleNumber}));
  }, [vehicleNumber]);

  const handleSave = async () => {
    if (!vehicleNumber.trim()) {
      dialog.alert('Please enter your vehicle number before saving.', {title: 'Vehicle number required', tone: 'info'});
      return;
    }
    setSaving(true);
    try {
      const updated = await usersApi.updateMe({carNumber: vehicleNumber.trim(), phone: phone.trim() || undefined});
      updateProfile({carNumber: updated.carNumber, phone: updated.phone});
      await AsyncStorage.setItem(colorStorageKey, selectedColor);
      setMode('view');
    } catch (err: any) {
      dialog.alert(err.message || 'Could not save vehicle details', {title: 'Error'});
    } finally {
      setSaving(false);
    }
  };

  const handleHelp = () => {
    dialog.alert('Add your vehicle number, phone number, and pick a body colour — the preview above updates live. This is saved to your account and used by the valet team.', {title: 'Vehicle Setup', tone: 'info'});
  };

  const sceneHTML = buildCarSceneHTML(selectedColor, vehicleNumber, colors.surface);
  const isCustomColor = ![...COLORS, ...MORE_COLORS].some(c => c.hex === selectedColor);
  const colorName = [...COLORS, ...MORE_COLORS].find(c => c.hex === selectedColor)?.name ?? 'Custom';

  return (
    <SafeAreaView edges={['top','bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <PressableScale
            style={[s.headerBtn, {backgroundColor: colors.cardAlt}]}
            onPress={() => navigation.navigate('Home')}
          >
            <Icon name="back" size={20} color={colors.textPrimary} />
          </PressableScale>
          <PressableScale style={[s.headerBtn, {backgroundColor: colors.primary}]} onPress={handleHelp}>
            <Icon name="help" size={18} color={colors.textOnPrimary} />
          </PressableScale>
        </View>

        <Text style={[s.title, {color: colors.textPrimary}]}>Vehicle Setup</Text>
        <Text style={[s.subtitle, {color: colors.textSecondary}]}>
          {mode === 'edit' ? 'Add your vehicle details and pick a colour' : 'Your saved vehicle details'}
        </Text>

        <View style={[s.previewCard, {backgroundColor: colors.surface, borderColor: colors.textPrimary}]}>
          <WebView
            ref={webRef}
            style={s.preview}
            source={{html: sceneHTML}}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            scrollEnabled={false}
          />
        </View>

        {mode === 'view' ? (
          <>
            <View style={[s.summarySheet, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              {[
                {icon: 'car' as const, label: 'Vehicle Number', value: vehicleNumber || '—'},
                {icon: 'phone' as const, label: 'Phone Number', value: phone || '—'},
                {icon: 'car' as const, label: 'Body Colour', value: colorName},
              ].map((row, i, arr) => (
                <View key={row.label} style={[s.summaryRow, {borderBottomColor: colors.divider}, i === arr.length - 1 && {borderBottomWidth: 0}]}>
                  <View style={[s.inputIconWrap, {backgroundColor: colors.cardAlt}]}>
                    <Icon name={row.icon} size={16} color={colors.textSecondary} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={[s.summaryLbl, {color: colors.textMuted}]}>{row.label.toUpperCase()}</Text>
                    <Text style={[s.summaryVal, {color: colors.textPrimary}]}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            <PressableScale style={[s.saveBtn, {backgroundColor: colors.primary}]} onPress={() => setMode('edit')}>
              <Icon name="edit" size={17} color={colors.textOnPrimary} />
              <Text style={[s.saveBtnTxt, {color: colors.textOnPrimary}]}>Edit Vehicle Details</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <Text style={[s.fieldLabel, {color: colors.textMuted}]}>VEHICLE NUMBER</Text>
            <View style={[s.inputRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
              <View style={[s.inputIconWrap, {backgroundColor: colors.cardAlt}]}>
                <Icon name="car" size={16} color={colors.textPrimary} />
              </View>
              <TextInput
                style={[s.input, {color: colors.textPrimary}]}
                value={vehicleNumber}
                onChangeText={t => setVehicleNumber(t.toUpperCase())}
                placeholder="e.g. TN09 AB 1234"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
            </View>

            <Text style={[s.fieldLabel, {color: colors.textMuted}]}>PHONE NUMBER</Text>
            <View style={[s.inputRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
              <View style={[s.inputIconWrap, {backgroundColor: colors.cardAlt}]}>
                <Icon name="phone" size={16} color={colors.textPrimary} />
              </View>
              <TextInput
                ref={phoneRef}
                style={[s.input, {color: colors.textPrimary}]}
                value={phone}
                onChangeText={t => setPhone(t.replace(/\D/g, ''))}
                placeholder="10-digit number"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={10}
                returnKeyType="done"
              />
            </View>

            <Text style={[s.fieldLabel, {color: colors.textMuted}]}>BODY COLOUR</Text>
            <View style={s.colorGrid}>
              {COLORS.map(c => {
                const active = c.hex === selectedColor;
                return (
                  <PressableScale key={c.hex} onPress={() => setSelectedColor(c.hex)} style={[s.swatchWrap, {width: SWATCH_COL_W}]}>
                    <View style={[
                      s.swatch,
                      {backgroundColor: c.hex, borderColor: active ? colors.textPrimary : colors.border, borderWidth: active ? 3 : 1},
                    ]}>
                      {active && <Icon name="checkBold" size={16} color={isLightColor(c.hex) ? '#111' : '#fff'} />}
                    </View>
                    <Text style={[s.swatchLbl, {color: colors.textSecondary}]} numberOfLines={1}>{c.name}</Text>
                  </PressableScale>
                );
              })}
              <PressableScale onPress={() => setPickerOpen(true)} style={[s.swatchWrap, {width: SWATCH_COL_W}]}>
                <View style={[
                  s.swatch,
                  !isCustomColor && s.moreSwatch,
                  {
                    borderColor: isCustomColor ? colors.textPrimary : colors.border,
                    borderWidth: isCustomColor ? 3 : 1.5,
                    backgroundColor: isCustomColor ? selectedColor : colors.cardAlt,
                  },
                ]}>
                  <Icon
                    name={isCustomColor ? 'checkBold' : 'plus'}
                    size={isCustomColor ? 16 : 18}
                    color={isCustomColor ? (isLightColor(selectedColor) ? '#111' : '#fff') : colors.textSecondary}
                  />
                </View>
                <Text style={[s.swatchLbl, {color: colors.textSecondary}]}>More</Text>
              </PressableScale>
            </View>

            <PressableScale style={[s.saveBtn, {backgroundColor: colors.primary, opacity: saving ? 0.6 : 1}]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.textOnPrimary} /> : (
                <>
                  <Icon name="save" size={17} color={colors.textOnPrimary} />
                  <Text style={[s.saveBtnTxt, {color: colors.textOnPrimary}]}>Save Vehicle</Text>
                  <Icon name="arrowRight" size={17} color={colors.textOnPrimary} />
                </>
              )}
            </PressableScale>
          </>
        )}
      </ScrollView>

      {/* Colour picker popup */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={[s.modalCard, {backgroundColor: colors.surface}]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, {color: colors.textPrimary}]}>Choose a colour</Text>
              <PressableScale style={[s.modalCloseBtn, {backgroundColor: colors.cardAlt}]} onPress={() => setPickerOpen(false)}>
                <Icon name="close" size={16} color={colors.textPrimary} />
              </PressableScale>
            </View>
            <View style={s.colorGrid}>
              {MORE_COLORS.map(c => {
                const active = c.hex === selectedColor;
                return (
                  <PressableScale
                    key={c.hex}
                    onPress={() => { setSelectedColor(c.hex); setPickerOpen(false); }}
                    style={[s.swatchWrap, {width: MODAL_SWATCH_COL_W}]}
                  >
                    <View style={[
                      s.swatch,
                      {backgroundColor: c.hex, borderColor: active ? colors.textPrimary : colors.border, borderWidth: active ? 3 : 1},
                    ]}>
                      {active && <Icon name="checkBold" size={16} color={isLightColor(c.hex) ? '#111' : '#fff'} />}
                    </View>
                    <Text style={[s.swatchLbl, {color: colors.textSecondary}]} numberOfLines={1}>{c.name}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: 20, paddingBottom: 40},
  headerRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20},
  headerBtn: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 28, fontWeight: '900'},
  subtitle: {fontSize: 13, marginTop: 4, marginBottom: 18},

  previewCard: {
    borderRadius: 20, borderWidth: 2, overflow: 'hidden', marginBottom: 24, height: 220,
    shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  preview: {flex: 1, backgroundColor: 'transparent'},

  fieldLabel: {fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 4},
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, height: 58, marginBottom: 16,
    shadowColor: '#000', shadowOffset: {width: 0, height: 3}, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  inputIconWrap: {width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10},
  input: {flex: 1, fontSize: 15, fontWeight: '600'},

  colorGrid: {flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: 18, marginBottom: 24},
  swatchWrap: {alignItems: 'center', gap: 6},
  swatch: {width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center'},
  moreSwatch: {borderWidth: 1.5, borderStyle: 'dashed'},
  swatchLbl: {fontSize: 10, fontWeight: '600'},

  saveBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, height: 54},
  saveBtnTxt: {fontSize: 15, fontWeight: '800'},

  summarySheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 20},
  summaryRow: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1},
  summaryLbl: {fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3},
  summaryVal: {fontSize: 15, fontWeight: '800'},

  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24},
  modalCard: {width: '100%', maxWidth: 420, borderRadius: 22, padding: 20},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18},
  modalTitle: {fontSize: 18, fontWeight: '900'},
  modalCloseBtn: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
});
