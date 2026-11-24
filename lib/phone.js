/**
 * Normalizes Indonesian phone numbers to +62... format
 */
export function normalizePhone(phoneStr) {
  if (!phoneStr || typeof phoneStr !== 'string') return null;

  // Remove non-digit characters except leading plus
  let cleaned = phoneStr.trim().replace(/[^0-9+]/g, '');

  if (!cleaned) return null;

  if (cleaned.startsWith('+65') || cleaned.startsWith('+62')) {
    return cleaned;
  }

  if (cleaned.startsWith('65') && cleaned.length >= 10) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith('62')) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith('0')) {
    return `+62${cleaned.substring(1)}`;
  }

  // Indonesian shorthand starting with 8 (e.g. 812xxxxxxx)
  if (cleaned.startsWith('8') && cleaned.length >= 9) {
    return `+62${cleaned}`;
  }

  return cleaned;
}

/**
 * Detects phone type (Singapore landline vs mobile, Indonesian phone, etc.)
 * Singapore:
 * - Mobile: +65 8xxx xxxx or +65 9xxx xxxx (WhatsApp supported)
 * - Fixed/Landline: +65 6xxx xxxx (No WhatsApp, voice call only)
 * Indonesia:
 * - Mobile: +62 8xxx (WhatsApp supported)
 * - Landline: +62 21 / +62 31 etc (Fixed line)
 */
export function getPhoneType(phoneStr, lang = 'en') {
  if (!phoneStr || typeof phoneStr !== 'string') {
    return { type: 'unknown', hasWhatsApp: false, isLandline: false, label: '' };
  }
  const cleaned = phoneStr.replace(/[^0-9+]/g, '');

  // Singapore numbers (+65...)
  if (cleaned.startsWith('+65') || cleaned.startsWith('65')) {
    const digits = cleaned.replace(/^\+?65/, '');
    if (digits.startsWith('8') || digits.startsWith('9')) {
      return { type: 'sg_mobile', hasWhatsApp: true, isLandline: false, label: 'SG Mobile (WA)' };
    }
    if (digits.startsWith('6')) {
      return {
        type: 'sg_landline',
        hasWhatsApp: false,
        isLandline: true,
        label: lang === 'id' ? 'SG Fixed Line (Hanya Panggilan)' : 'SG Fixed Line (Call Only)'
      };
    }
    return {
      type: 'sg_other',
      hasWhatsApp: true,
      isLandline: false,
      label: lang === 'id' ? 'Telepon SG' : 'SG Phone'
    };
  }

  // Indonesian numbers (+62...)
  if (cleaned.startsWith('+62') || cleaned.startsWith('62') || cleaned.startsWith('08')) {
    const digits = cleaned.replace(/^\+?62/, '').replace(/^0/, '');
    if (digits.startsWith('8')) {
      return { type: 'id_mobile', hasWhatsApp: true, isLandline: false, label: 'ID Mobile (WA)' };
    }
    return {
      type: 'id_landline',
      hasWhatsApp: false,
      isLandline: true,
      label: lang === 'id' ? 'ID Landline (Telp Kantor)' : 'ID Landline (Office Call)'
    };
  }

  return {
    type: 'general',
    hasWhatsApp: true,
    isLandline: false,
    label: lang === 'id' ? 'Telepon' : 'Phone'
  };
}

/**
 * Generates an instant WhatsApp click-to-chat URL (wa.me)
 * Supports SG (+65) and ID (+62) numbers with prefilled B2B outreach greeting
 */
export function getWhatsAppUrl(phoneStr, companyName = '', customMessage = '', lang = 'en') {
  if (!phoneStr || typeof phoneStr !== 'string') return null;
  const digits = phoneStr.replace(/[^0-9]/g, '');
  if (!digits || digits.length < 7) return null;

  let intlDigits = digits;
  let isIndonesia = false;
  let isSingapore = false;

  // Singapore numbers
  if (digits.startsWith('65') && digits.length >= 10) {
    intlDigits = digits;
    isSingapore = true;
  } else if (digits.length === 8 && (digits.startsWith('8') || digits.startsWith('9'))) {
    intlDigits = `65${digits}`;
    isSingapore = true;
  } else if (digits.startsWith('08')) {
    // Indonesian mobile starting with 08
    intlDigits = `62${digits.slice(1)}`;
    isIndonesia = true;
  } else if (digits.startsWith('8') && digits.length >= 9 && digits.length <= 13) {
    intlDigits = `62${digits}`;
    isIndonesia = true;
  } else if (digits.startsWith('62')) {
    intlDigits = digits;
    isIndonesia = true;
  }

  let message = customMessage;
  if (!message) {
    const cleanName = companyName ? companyName.trim() : '';
    // If Indonesian contact and Indonesian language selected, use Indonesian
    if (lang === 'id' && isIndonesia) {
      message = cleanName
        ? `Halo tim ${cleanName}, saya dari tim Prospekta. Menghubungi terkait peningkatan kehadiran digital dan operasional bisnis Anda. Apakah ada waktu luang 60 detik untuk berdiskusi singkat?`
        : `Halo, saya dari tim Prospekta. Menghubungi terkait peningkatan kehadiran digital dan operasional bisnis Anda. Apakah ada waktu luang 60 detik untuk berdiskusi singkat?`;
    } else {
      // Default to English (standard for Singapore & international B2B outreach)
      message = cleanName
        ? `Hi ${cleanName} team, Prospekta team here. Reaching out regarding your digital presence & operations. Would you be open to a quick 60-second overview?`
        : `Hi, Prospekta team here. Reaching out regarding your business digital presence. Would you be open to a quick 60-second overview?`;
    }
  }

  return `https://wa.me/${intlDigits}?text=${encodeURIComponent(message)}`;
}

