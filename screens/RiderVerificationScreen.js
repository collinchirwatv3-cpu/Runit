import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, ActivityIndicator, Image,
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
  const [licensePreview, setLicensePreview] = useState(null);
  const [bikePreview, setBikePreview] = useState(null);
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

    if (!hasLicense) { setError("Please upload your driver's license"); return; }
    if (!hasBike) { setError('Please upload a photo of your bike'); return; }

    setUploading(true);
    try {
      const uid = user.id;
      let licenseUrl = verification?.license_url;
      let bikeUrl = verification?.bike_url;

      if (licenseFile) licenseUrl = await uploadToStorage(licenseFile, `${uid}/license`);
      if (bikeFile) bikeUrl = await uploadToStorage(bikeFile, `${uid}/bike`);

      const payload = {
        rider_id: uid,
        rider_name: user.user_metadata?.name || '',
        rider_email: user.email || '',
        license_url: licenseUrl,
        bike_url: bikeUrl,
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
        <Text style={s.logo}>🏍️</Text>
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
  logo: { fontSize: 40 },
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
});
