import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, Image, Platform, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { signOut } from '../auth';
import TopBar from './TopBar';
import BottomBar from './BottomBar';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const MUTED = '#444';
const GREY = '#777';

const ROLE_LABEL = { customer: 'Customer', rider: 'Rider', merchant: 'Merchant' };

// ─── Tip row ──────────────────────────────────────────────────────────────
function TipRow({ icon, text }) {
  return (
    <View style={g.tipRow}>
      <View style={g.tipIcon}>
        <Ionicons name={icon} size={16} color={LIME} />
      </View>
      <Text style={g.tipTxt}>{text}</Text>
    </View>
  );
}

// ─── Rider photo guidance modal ───────────────────────────────────────────
function PhotoGuideModal({ visible, onCamera, onLibrary, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={g.overlay}>
        <View style={g.card}>
          <Text style={g.title}>Profile Photo</Text>
          <Text style={g.sub}>A clear face photo helps customers trust you</Text>

          {/* Face oval guide */}
          <View style={g.ovalWrap}>
            <View style={g.ovalOuter}>
              <View style={g.oval} />
            </View>
            <View style={g.ovalLabel}>
              <Ionicons name="sunny-outline" size={14} color={LIME} />
              <Text style={g.ovalLabelTxt}>Face the light</Text>
            </View>
          </View>

          {/* Tips */}
          <View style={g.tips}>
            <TipRow icon="sunny-outline"   text="Stand near a window or bright light facing you" />
            <TipRow icon="eye-outline"     text="Look straight at the camera, chin slightly down" />
            <TipRow icon="shirt-outline"   text="Remove sunglasses or hat — plain background" />
            <TipRow icon="phone-portrait-outline" text="Hold the phone at eye level, arm extended" />
          </View>

          {/* Actions */}
          <TouchableOpacity style={g.cameraBtn} onPress={onCamera} activeOpacity={0.85}>
            <Ionicons name="camera" size={20} color={BG} />
            <Text style={g.cameraBtnTxt}>Open Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={g.libraryBtn} onPress={onLibrary} activeOpacity={0.7}>
            <Ionicons name="images-outline" size={16} color={GREY} />
            <Text style={g.libraryTxt}>Choose from library</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text style={g.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Preview + confirm modal ──────────────────────────────────────────────
function PreviewModal({ uri, uploading, onUse, onRetake }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade">
      <View style={g.overlay}>
        <View style={g.previewCard}>
          <Text style={g.title}>Looking good?</Text>
          <Text style={[g.sub, { marginBottom: 24 }]}>This is how riders and customers will see you</Text>

          {uri && (
            <Image
              source={{ uri }}
              style={g.previewImg}
              resizeMode="cover"
            />
          )}

          <TouchableOpacity
            style={[g.cameraBtn, { marginTop: 28 }, uploading && { opacity: 0.6 }]}
            onPress={onUse}
            disabled={uploading}
            activeOpacity={0.85}
          >
            {uploading
              ? <ActivityIndicator color={BG} />
              : <>
                  <Ionicons name="checkmark-circle" size={20} color={BG} />
                  <Text style={g.cameraBtnTxt}>Use This Photo</Text>
                </>
            }
          </TouchableOpacity>

          <TouchableOpacity style={g.libraryBtn} onPress={onRetake} disabled={uploading} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={16} color={GREY} />
            <Text style={g.libraryTxt}>Retake</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [previewUri, setPreviewUri] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setUser(u);
      setAvatarUrl(u?.user_metadata?.avatar_url || null);
      setLoading(false);
    });
  }, []);

  // ── Camera trigger (web) ────────────────────────────────────────────────
  const openCamera = (capture = true) => {
    if (Platform.OS !== 'web') { openNativeCamera(); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = 'user';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setPreviewUri(URL.createObjectURL(file));
      setPreviewFile(file);
    };
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 500);
  };

  const openNativeCamera = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take a profile photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.85,
        cameraType: ImagePicker.CameraType.front,
      });
      if (!result.canceled && result.assets?.[0]) {
        setPreviewUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Not available', 'Camera access is not supported on this device.');
    }
  };

  // ── Upload ──────────────────────────────────────────────────────────────
  const uploadPhoto = async () => {
    if (!previewFile && !previewUri) return;
    setUploading(true);

    let fileToUpload = previewFile;
    let contentType = previewFile?.type || 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const path = `${user.id}.${ext}`;

    // Native: fetch URI as blob
    if (!fileToUpload && previewUri) {
      const resp = await fetch(previewUri);
      fileToUpload = await resp.blob();
    }

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, fileToUpload, { upsert: true, contentType });

    if (error) {
      Alert.alert('Upload failed', error.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const bust = publicUrl + '?t=' + Date.now();
    await supabase.auth.updateUser({ data: { avatar_url: bust } });
    setAvatarUrl(bust);
    setPreviewUri(null);
    setPreviewFile(null);
    setUploading(false);
  };

  // ── Avatar tap handler ──────────────────────────────────────────────────
  const handleAvatarPress = () => {
    const role = user?.user_metadata?.role;
    if (role === 'rider') {
      setShowGuide(true);
    } else {
      // customers: direct pick, no guide
      openCamera(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const name = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const phone = user?.user_metadata?.phone || '';
  const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    : 'Recently';
  const role = user?.user_metadata?.role || 'customer';

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={LIME} size="large" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <TopBar />
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.backRow} />

        <Text style={s.headline}>My{'\n'}<Text style={s.headlineAccent}>Profile.</Text></Text>

        {/* Avatar with camera button */}
        <View style={s.avatarWrap}>
          <View style={s.avatarRing}>
            <TouchableOpacity style={s.avatar} onPress={handleAvatarPress} activeOpacity={0.85}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarTxt}>{initials}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.cameraFab} onPress={handleAvatarPress} activeOpacity={0.85}>
              <Ionicons name="camera" size={14} color={BG} />
            </TouchableOpacity>
          </View>

          <Text style={s.name}>{name}</Text>
          <View style={s.rolePill}>
            <Text style={s.roleTxt}>{ROLE_LABEL[role] || role}</Text>
          </View>

          {role === 'rider' && !avatarUrl && (
            <TouchableOpacity style={s.addPhotoBanner} onPress={() => setShowGuide(true)}>
              <Ionicons name="camera-outline" size={16} color={LIME} />
              <Text style={s.addPhotoBannerTxt}>Add profile photo — builds customer trust</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.infoCard}>
          {[
            { icon: 'mail-outline',     label: 'Email',        value: email || '—' },
            { icon: 'call-outline',     label: 'Phone',        value: phone || '—' },
            { icon: 'calendar-outline', label: 'Member Since', value: memberSince },
            { icon: 'location-outline', label: 'City',         value: 'Cape Town' },
          ].map((row, i, arr) => (
            <View key={i}>
              <View style={s.infoRow}>
                <View style={s.infoIconWrap}>
                  <Ionicons name={row.icon} size={16} color={GREY} />
                </View>
                <Text style={s.infoLbl}>{row.label}</Text>
                <Text style={s.infoVal} numberOfLines={1}>{row.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="power-outline" size={18} color="#ef4444" />
          <Text style={s.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rider photo guide */}
      <PhotoGuideModal
        visible={showGuide}
        onCamera={() => { setShowGuide(false); setTimeout(() => openCamera(true), 300); }}
        onLibrary={() => { setShowGuide(false); setTimeout(() => openCamera(false), 300); }}
        onClose={() => setShowGuide(false)}
      />

      {/* Preview + confirm */}
      <PreviewModal
        uri={previewUri}
        uploading={uploading}
        onUse={uploadPhoto}
        onRetake={() => { setPreviewUri(null); setPreviewFile(null); }}
      />

      <BottomBar
        active="profile"
        role={role}
        onPress={(tabId) => {
          if (tabId === 'orders') navigation.navigate('Orders');
          else if (tabId === 'settings') navigation.navigate('Settings');
          else if (tabId === 'home') navigation.goBack();
        }}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 90, paddingBottom: 100 },
  backRow: { height: 8, marginBottom: 20 },

  headline: {
    fontSize: 56, fontWeight: '900', color: '#fff',
    letterSpacing: -1, lineHeight: 60, marginBottom: 36,
  },
  headlineAccent: { color: LIME },

  avatarWrap: { alignItems: 'center', marginBottom: 32 },
  avatarRing: { position: 'relative', marginBottom: 16 },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 28, elevation: 14,
    overflow: 'hidden',
  },
  avatarImg: { width: 100, height: 100, borderRadius: 50 },
  avatarTxt: { fontSize: 38, fontWeight: '900', color: BG },
  cameraFab: {
    position: 'absolute', bottom: 0, right: -4,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: BG,
  },
  name: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 10 },
  rolePill: {
    backgroundColor: LIME + '15', borderWidth: 1, borderColor: LIME + '35',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 5,
  },
  roleTxt: { fontSize: 12, fontWeight: '800', color: LIME, letterSpacing: 2, textTransform: 'uppercase' },
  addPhotoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: LIME + '10', borderWidth: 1, borderColor: LIME + '30',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  addPhotoBannerTxt: { fontSize: 13, color: LIME, fontWeight: '600' },

  infoCard: { backgroundColor: SURFACE, borderRadius: 20, marginBottom: 24, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  infoIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  infoLbl: { fontSize: 14, color: GREY, fontWeight: '600', flex: 1 },
  infoVal: { fontSize: 14, fontWeight: '800', color: '#fff', maxWidth: '55%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#1a1a1a', marginLeft: 60 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
    borderRadius: 16, height: 58,
  },
  signOutTxt: { fontSize: 16, fontWeight: '900', color: '#ef4444' },
});

// Guide + preview modal styles
const g = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#141414', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 28, paddingTop: 28, paddingBottom: 48,
  },
  previewCard: {
    backgroundColor: '#141414', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 28, paddingTop: 28, paddingBottom: 48,
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 4 },
  sub: { fontSize: 14, color: GREY, marginBottom: 20 },

  // Face oval guide
  ovalWrap: { alignItems: 'center', marginBottom: 24 },
  ovalOuter: {
    width: 140, height: 170, borderRadius: 70,
    borderWidth: 2.5, borderColor: LIME,
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: LIME, shadowOpacity: 0.3, shadowRadius: 16,
  },
  oval: {
    width: 120, height: 150, borderRadius: 60,
    backgroundColor: LIME + '08',
  },
  ovalLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10,
  },
  ovalLabelTxt: { fontSize: 12, color: LIME, fontWeight: '600' },

  // Tips
  tips: { gap: 10, marginBottom: 24 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: LIME + '15', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  tipTxt: { fontSize: 13, color: '#ccc', lineHeight: 20, flex: 1, paddingTop: 4 },

  // Buttons
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: LIME, borderRadius: 16, height: 56,
    shadowColor: LIME, shadowOpacity: 0.35, shadowRadius: 18,
  },
  cameraBtnTxt: { fontSize: 16, fontWeight: '900', color: BG },
  libraryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, marginTop: 10,
  },
  libraryTxt: { fontSize: 14, color: GREY, fontWeight: '600' },
  cancelTxt: { fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 8, fontWeight: '600' },

  // Preview
  previewImg: {
    width: 200, height: 200, borderRadius: 100,
    borderWidth: 3, borderColor: LIME,
    shadowColor: LIME, shadowOpacity: 0.4, shadowRadius: 24,
  },
});
