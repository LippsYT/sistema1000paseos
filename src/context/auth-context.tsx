
"use client";

import * as React from "react";
import type { User } from "@/lib/types";
import { db } from "@/lib/data";
import { doc, updateDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";


type AuthContextType = {
  user: User | null;
  setUser: (user: User | null) => void;
  isLoading: boolean;
};

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const storedUserJson = localStorage.getItem("user");
    if (storedUserJson) {
        const storedUser = JSON.parse(storedUserJson);
        setUser(storedUser);
    }
    setIsLoading(false);
  }, []);
  
    React.useEffect(() => {
    if (!user?.id) return;

    const userRef = doc(db, "users", user.id);

    // Set online status
    updateDoc(userRef, {
      status: "online",
      lastSeen: serverTimestamp(),
    }).catch(console.error);

    const handleBeforeUnload = () => {
      updateDoc(userRef, {
        status: "offline",
        lastSeen: serverTimestamp(),
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Subscribe to user document changes
    const unsubscribe = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
            const updatedUser = { id: doc.id, ...doc.data() } as User;
             setUser(currentUser => ({...currentUser, ...updatedUser}));
        }
    });

    return () => {
      handleBeforeUnload(); // Set to offline when component unmounts
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unsubscribe();
    };
  }, [user?.id]);


  const handleSetUser = (newUser: User | null) => {
    setUser(newUser);
    if (newUser) {
      localStorage.setItem("user", JSON.stringify(newUser));
    } else {
      localStorage.removeItem("user");
    }
  };

  const value = { 
    user, 
    setUser: handleSetUser,
    isLoading 
  };

  return (
    <AuthContext.Provider value={value}>
        {children}
        <FirebaseErrorListener />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
