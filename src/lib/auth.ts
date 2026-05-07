import { FirebaseError } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import { firebaseApp } from "./firebase";
import type { User } from "./types";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

export async function signIn(email: string, password: string): Promise<User | null> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    if (firebaseUser) {
      const q = query(collection(db, "users"), where("email", "==", email.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.error("No user profile found in Firestore for this email.");
        await firebaseSignOut(auth);
        return null;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as Omit<User, "id">;

      return {
        id: userDoc.id,
        ...userData,
      };
    }

    return null;
  } catch (error) {
    const firebaseError = error instanceof FirebaseError ? error : null;
    const errorCode = firebaseError?.code;

    console.warn("Authentication failed:", errorCode ?? error);

    if (
      errorCode === "auth/user-not-found" ||
      errorCode === "auth/wrong-password" ||
      errorCode === "auth/invalid-credential"
    ) {
      throw new Error("Credenciales incorrectas. Por favor, verifique su email y contrasena.");
    }

    if (errorCode === "auth/network-request-failed") {
      throw new Error(
        "No se pudo conectar con Firebase Auth. Si abriste la app desde la IP 192.168.0.103, agrega 192.168.0.103 en Firebase Console > Authentication > Settings > Authorized domains."
      );
    }

    if (errorCode === "auth/unauthorized-domain" || errorCode === "auth/app-not-authorized") {
      throw new Error(
        "La IP 192.168.0.103 no esta autorizada en Firebase Authentication. Agrega 192.168.0.103 en Firebase Console > Authentication > Settings > Authorized domains."
      );
    }

    throw new Error("Ocurrio un error durante la autenticacion.");
  }
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export { auth };
