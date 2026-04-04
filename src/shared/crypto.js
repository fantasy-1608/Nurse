/**
 * 🏥 HIS Shared — Crypto Module
 * PIN hashing, API key encryption/decryption
 * Sử dụng Web Crypto API (PBKDF2 + AES-GCM)
 * 
 * Cách dùng:
 *   const salt = HIS.Crypto.generateSalt();
 *   const hash = await HIS.Crypto.hashPIN('1234', salt);
 *   const encrypted = await HIS.Crypto.encryptAPIKey(apiKey, pin, salt);
 */

window.HIS = window.HIS || {};

HIS.Crypto = (function () {
    'use strict';

    const ITERATIONS = 100000;
    const KEY_LENGTH = 256;

    function generateSalt() {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        return btoa(String.fromCharCode(...salt));
    }

    async function hashPIN(pin, salt) {
        const encoder = new TextEncoder();
        const pinData = encoder.encode(pin);
        const saltData = Uint8Array.from(atob(salt), c => c.charCodeAt(0));

        const baseKey = await crypto.subtle.importKey(
            'raw', pinData, 'PBKDF2', false, ['deriveBits']
        );

        const hashBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: saltData, iterations: ITERATIONS, hash: 'SHA-256' },
            baseKey, KEY_LENGTH
        );

        return btoa(String.fromCharCode(...new Uint8Array(hashBits)));
    }

    async function verifyPIN(pin, storedHash, salt) {
        const computedHash = await hashPIN(pin, salt);
        return computedHash === storedHash;
    }

    async function deriveKey(pin, salt) {
        const encoder = new TextEncoder();
        const pinData = encoder.encode(pin);
        const saltData = Uint8Array.from(atob(salt), c => c.charCodeAt(0));

        const baseKey = await crypto.subtle.importKey(
            'raw', pinData, 'PBKDF2', false, ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltData, iterations: ITERATIONS, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encrypt(plaintext, key) {
        if (!plaintext || !key) return plaintext;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, encoded
        );

        const ivB64 = btoa(String.fromCharCode(...iv));
        const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
        return `${ivB64}:${cipherB64}`;
    }

    async function decrypt(encryptedText, key) {
        if (!encryptedText || !key || !encryptedText.includes(':')) return null;
        try {
            const [ivB64, cipherB64] = encryptedText.split(':');
            const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
            const ciphertext = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv }, key, ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            if (HIS.Logger) HIS.Logger.error('Crypto', 'Decrypt failed:', e);
            return null;
        }
    }

    async function encryptAPIKey(apiKey, pin, salt) {
        const key = await deriveKey(pin, salt);
        return encrypt(apiKey, key);
    }

    async function decryptAPIKey(encryptedKey, pin, salt) {
        const key = await deriveKey(pin, salt);
        return decrypt(encryptedKey, key);
    }

    async function migrateIfNeeded() {
        try {
            if (!chrome?.storage?.local) return false;

            const result = await HIS.Storage.get([
                'dashboard_password', 'pin_hash', 'pin_salt',
                'geminiApiKey', 'geminiApiKey_encrypted'
            ]);

            if (result.pin_hash && result.pin_salt) return false;

            const plainPin = result.dashboard_password;
            if (!plainPin || plainPin.length === 0) return false;

            if (HIS.Logger) HIS.Logger.info('Crypto', '🔄 Migrating plaintext credentials...');

            const salt = generateSalt();
            const pinHash = await hashPIN(plainPin, salt);

            const apiKey = result.geminiApiKey || '';
            let encryptedApiKey = '';
            if (apiKey && !apiKey.includes(':')) {
                encryptedApiKey = await encryptAPIKey(apiKey, plainPin, salt);
            }

            const patch = { pin_hash: pinHash, pin_salt: salt };
            if (encryptedApiKey) {
                patch.geminiApiKey_encrypted = encryptedApiKey;
            }

            await HIS.Storage.set(patch);
            await HIS.Storage.remove('dashboard_password');

            if (HIS.Logger) HIS.Logger.success('Crypto', '✅ Migration complete');
            return true;
        } catch (e) {
            if (HIS.Logger) HIS.Logger.error('Crypto', '❌ Migration failed:', e);
            return false;
        }
    }

    return {
        generateSalt, hashPIN, verifyPIN, deriveKey,
        encrypt, decrypt, encryptAPIKey, decryptAPIKey, migrateIfNeeded
    };
})();

console.log('[HIS] 🏥 Shared crypto module loaded');
