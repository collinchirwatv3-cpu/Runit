import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, ActivityIndicator, Image, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

const LIME = '#c8f000';
const BG = '#080808';
const SURFACE = '#111';
const GREY = '#777';
const MUTED = '#444';

const BUCKET = 'rider-docs';

function pickImageWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => resolve(e.target.files[0] || null);
    input.click();
  });
}

export default function RiderVerificationScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [verification, setVerification] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [bikeFile, setBikeFile] = useState(null);
  const [discFile, setDiscFile] = useState(null);
  const [licensePreview, setLicensePreview] = useState(null);
  const [bikePreview, setBikePreview] = useState(null);
  const [discPreview, setDiscPreview] = useState(null);
  const [discExpiry, setDiscExpiry] = useState(''); // MM/YYYY
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const sub = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      if (!u) return;

      const { data } = await supabase
        .from('rider_verifications')
        .select('*')
        .eq('rider_id', u.id)
        .single();
      if (data) setVerification(data);

      sub.current = supabase
        .channel('my_verification')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'rider_verifications',
          filter: `rider_id=eq.${u.id}`,
        }, (p) => {
          setVerification(p.new);
          if (p.new.status === 'approved') navigation.replace('Rider');
        })
        .subscribe();
    })();

    return () => sub.current?.unsubscribe();
  }, []);

  const pickLicense = async () => {
    if (Platform.OS !== 'web') return;
    const file = await pickImageWeb();
    if (!file) return;
    setLicenseFile(file);
    setLicensePreview(URL.createObjectURL(file));
  };

  const pickBike = async () => {
    if (Platform.OS !== 'web') return;
    const file = await pickImageWeb();
    if (!file) return;
    setBikeFile(file);
    setBikePreview(URL.createObjectURL(file));
  };

  const pickDisc = async () => {
    if (Platform.OS !== 'web') return;
    const file = await pickImageWeb();
    if (!file) return;
    setDiscFile(file);
    setDiscPreview(URL.createObjectURL(file));
  };

  // Parse MM/YYYY → last day of that month as ISO date string
  const parseDiscExpiry = (val) => {
    const clean = val.trim();
    const match = clean.match(/^(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const month = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);
    if (month < 1 || month > 12 || year < 2024) return null;
    const lastDay = new Date(year, month, 0); // last day of that month
    return lastDay.toISOString().split('T')[0];
  };

  // Auto-insert slash after MM
  const handleDiscExpiryChange = (val) => {
    let v = val.replace(/[^\d/]/g, '');
    if (v.length === 2 && !v.includes('/') && discExpiry.length === 1) v = v + '/';
    if (v.length > 7) return;
    setDiscExpiry(v);
  };

  const uploadToStorage = async (file, path) => {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicUrl;
  };

  const handleSubmit = async () => {
    setError('');
    const hasLicense = licenseFile || verification?.license_url;
    const hasBike = bikeFile || verification?.bike_url;
    const hasDisc = discFile || verification?.disc_url;
    const expiryIso = discExpiry ? parseDiscExpiry(discExpiry) : verification?.disc_expiry;

    if (!hasLicense) { setError("Please upload your driver's license"); return; }
    if (!hasBike) { setError('Please upload a photo of your bike'); return; }
    if (!hasDisc) { setError('Please upload your license disc photo'); return; }
    if (!expiryIso) { setError('Enter disc expiry as MM/YYYY (e.g. 05/2026)'); return; }

    // Block submission if disc already expired
    const expiryDate = new Date(expiryIso);
    if (expiryDate < new Date()) {
      setError('Your license disc has already expired. Please renew before submitting.');
      return;
    }

    setUploading(true);
    try {
      const uid = user.id;
      let licenseUrl = verification?.license_url;
      let bikeUrl = verification?.bike_url;
      let discUrl = verification?.disc_url;

      if (licenseFile) licenseUrl = await uploadToStorage(licenseFile, `${uid}/license`);
      if (bikeFile) bikeUrl = await uploadToStorage(bikeFile, `${uid}/bike`);
      if (discFile) discUrl = await uploadToStorage(discFile, `${uid}/disc`);

      const payload = {
        rider_id: uid,
        rider_name: user.user_metadata?.name || '',
        rider_email: user.email || '',
        license_url: licenseUrl,
        bike_url: bikeUrl,
        disc_url: discUrl,
        disc_expiry: expiryIso,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      };

      const { error: dbErr } = await supabase
        .from('rider_verifications')
        .upsert(payload, { onConflict: 'rider_id' });
      if (dbErr) throw dbErr;

      setVerification(payload);
    } catch (e) {
      setError(e.message || 'Upload failed, please try again');
    } finally {
      setUploading(false);
    }
  };

  const status = verification?.status;

  if (status === 'submitted') {
    return (
      <View style={s.centered}>
        <Text style={{ fontSize: 52, marginBottom: 20 }}>⏳</Text>
        <Text style={s.h1}>Under Review</Text>
        <Text style={s.sub}>
          Your documents have been submitted. We'll verify your account within 24 hours.
        </Text>
        <Text style={s.hint}>You'll be redirected automatically once approved.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.wordmark}>RUN<Text style={s.wordmarkAccent}>IT</Text></Text>
        <Text style={s.h1}>Rider Verification</Text>
        <Text style={s.sub}>
          {status === 'rejected'
            ? 'Your application was not approved. Please resubmit your documents.'
            : 'Upload your documents before you can start taking deliveries.'}
        </Text>
        {status === 'rejected' && verification?.rejection_reason ? (
          <View style={s.rejectedBox}>
            <Text style={s.rejectedLabel}>Reason:</Text>
            <Text style={s.rejectedReason}>{verification.rejection_reason}</Text>
          </View>
        ) : null}
      </View>

      <UploadCard
        title="Driver's License"
        subtitle="Front of your valid driver's license"
        icon="card-outline"
        preview={licensePreview || verification?.license_url}
        onPress={pickLicense}
      />

      <UploadCard
        title="Bike / Vehicle Photo"
        subtitle="Clear photo showing your bike and number plate"
        icon="bicycle-outline"
        preview={bikePreview || verification?.bike_url}
        onPress={pickBike}
      />

      <UploadCard
        title="License Disc"
        subtitle="Photo of the current disc displayed on your bike"
        icon="shield-checkmark-outline"
        preview={discPreview || verification?.disc_url}
        onPress={pickDisc}
      />

      <View style={s.card}>
        <Text style={s.cardTitle}>Disc Expiry Date</Text>
        <Text style={s.cardSub}>Found on the license disc — format MM/YYYY</Text>
        <TextInput
          style={s.expiryInput}
          placeholder="e.g. 05/2026"
          placeholderTextColor={GREY}
          value={discExpiry || (verification?.disc_expiry
            ? (() => { const d = new Date(verification.disc_expiry); return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })()
            : '')}
          onChangeText={handleDiscExpiryChange}
          keyboardType="numeric"
          maxLength={7}
        />
        <Text style={s.expiryHint}>
          🔒 Riders are automatically taken offline when this date passes
        </Text>
      </View>

      {error ? <Text style={s.errorTxt}>{error}</Text> : null}

      <TouchableOpacity
        style={[s.submitBtn, uploading && s.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={uploading}
      >
        {uploading
          ? <ActivityIndicator color={BG} />
          : <Text style={s.submitTxt}>Submit for Review</Text>}
      </TouchableOpacity>

      <Text style={s.footer}>
        By submitting, you confirm all documents are genuine and belong to you.
      </Text>
    </ScrollView>
  );
}

function UploadCard({ title, subtitle, icon, preview, onPress }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardSub}>{subtitle}</Text>
      <TouchableOpacity style={s.uploadZone} onPress={onPress}>
        {preview ? (
          <Image source={{ uri: preview }} style={s.previewImg} resizeMode="cover" />
        ) : (
          <>
            <Ionicons name={icon} size={32} color={LIME} />
            <Text style={s.uploadTxt}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      {preview ? (
        <TouchableOpacity onPress={onPress} style={s.changeBtn}>
          <Text style={s.changeTxt}>Change photo</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 24, paddingBottom: 60 },
  centered: {
    flex: 1, backgroundColor: BG, alignItems: 'center',
    justifyContent: 'center', padding: 32,
  },
  header: { alignItems: 'center', marginBottom: 28, gap: 10 },
  wordmark: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 5, marginBottom: 4 },
  wordmarkAccent: { color: LIME },
  h1: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  sub: { fontSize: 14, color: GREY, textAlign: 'center', lineHeight: 20 },
  hint: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 8 },
  rejectedBox: {
    backgroundColor: '#ef444418', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#ef444440', width: '100%', marginTop: 4,
  },
  rejectedLabel: { fontSize: 11, color: '#ef4444', fontWeight: '700', marginBottom: 4 },
  rejectedReason: { fontSize: 13, color: '#ef4444' },
  card: { backgroundColor: SURFACE, borderRadius: 16, padding: 18, marginBottom: 14, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cardSub: { fontSize: 12, color: GREY },
  uploadZone: {
    height: 150, borderRadius: 12, borderWidth: 1.5, borderColor: MUTED,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    marginTop: 8, overflow: 'hidden',
  },
  previewImg: { width: '100%', height: '100%' },
  uploadTxt: { color: GREY, fontSize: 13, marginTop: 8 },
  changeBtn: { alignItems: 'center', paddingVertical: 6 },
  changeTxt: { color: LIME, fontSize: 13, fontWeight: '600' },
  errorTxt: { color: '#ef4444', textAlign: 'center', marginBottom: 10, fontSize: 14 },
  submitBtn: {
    backgroundColor: LIME, borderRadius: 14, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitTxt: { color: BG, fontWeight: '800', fontSize: 16 },
  footer: { color: MUTED, fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 },
  expiryInput: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: 2,
    borderWidth: 1, borderColor: MUTED, marginTop: 10, textAlign: 'center',
  },
  expiryHint: { fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 16 },
});
