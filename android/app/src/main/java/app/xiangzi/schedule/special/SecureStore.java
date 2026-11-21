package app.xiangzi.schedule.special;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class SecureStore {
    private static final String ALIAS = "xiangzi-special-storage-v1";
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static synchronized JSONObject load(Context context) throws Exception {
        AtomicFile file = new AtomicFile(new File(context.getFilesDir(), "schedule.enc"));
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return null;
        byte[] data = file.readFully();
        if (data.length < 29 || data[0] != 1) throw new IOException("Invalid storage version");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, data, 1, 12));
        return new JSONObject(new String(cipher.doFinal(data, 13, data.length - 13), StandardCharsets.UTF_8));
    }
    static synchronized void save(Context context, JSONObject value) throws Exception {
        byte[] plain = value.toString().getBytes(StandardCharsets.UTF_8);
        if (plain.length > 25 * 1024 * 1024) throw new IOException("Storage limit exceeded");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(plain);
        AtomicFile file = new AtomicFile(new File(context.getFilesDir(), "schedule.enc"));
        // Preserve the previous encrypted state for recovery before a restore.
        if (file.getBaseFile().exists()) {
            try (FileInputStream source = new FileInputStream(file.getBaseFile()); FileOutputStream target = new FileOutputStream(new File(context.getFilesDir(), "schedule.previous.enc"))) {
                byte[] buffer = new byte[8192]; int count; while ((count = source.read(buffer)) != -1) target.write(buffer, 0, count);
            }
        }
        FileOutputStream output = file.startWrite();
        try { output.write(1); output.write(cipher.getIV()); output.write(encrypted); file.finishWrite(output); }
        catch (Exception error) { file.failWrite(output); throw error; }
    }
}
