

"use client";

import * as React from "react";
import { Send, UserCircle, Users, Check, CheckCheck } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { subscribeToUsers, getChatMessages, sendChatMessage, markMessagesAsRead, subscribeToUserChats } from "@/lib/data";
import type { ChatMessage, User, ChatWithUnread } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [allUsers, setAllUsers] = React.useState<User[]>([]);
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [userChats, setUserChats] = React.useState<ChatWithUnread[]>([]);

  React.useEffect(() => {
    if (!user) return;
    const unsubscribeUsers = subscribeToUsers((usersData) => {
      setAllUsers(usersData.filter(u => u.id !== user.id && u.name));
    });

    const unsubscribeChats = subscribeToUserChats(user.id, (chats) => {
        setUserChats(chats);
    });

    return () => {
        unsubscribeUsers();
        unsubscribeChats();
    };
  }, [user]);

  const chatId = React.useMemo(() => {
    if (!user || !selectedUser) return null;
    return [user.id, selectedUser.id].sort().join('_');
  }, [user, selectedUser]);


  React.useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    const unsubscribe = getChatMessages(chatId, (newMessages) => {
      setMessages(newMessages);
      setIsLoading(false);
      if(user?.id) {
          markMessagesAsRead(chatId, user.id);
      }
    });

    return () => unsubscribe();
  }, [chatId, user?.id]);


  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === "" || !user || !chatId) return;

    try {
      await sendChatMessage(chatId, {
        text: newMessage,
        userId: user.id,
        userName: user.name,
        isRead: false,
      });
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error al enviar",
        description: "No se pudo enviar tu mensaje.",
        variant: "destructive",
      });
    }
  };

  const ReadReceipt = ({ isRead }: { isRead: boolean }) => {
    if (isRead) {
      return <CheckCheck className="h-4 w-4 text-blue-500" />;
    }
    return <Check className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-1/3 min-w-[280px] max-w-[350px] border-r flex flex-col">
        <header className="p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5"/>
            Conversaciones
          </h2>
        </header>
        <div className="flex-1 overflow-y-auto">
          {allUsers.map(u => {
              const chat = userChats.find(c => c.otherUserId === u.id);
              const unreadCount = chat?.unreadCount || 0;
              return (
                <button 
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={cn(
                    "w-full text-left p-3 flex items-center gap-3 hover:bg-muted transition-colors relative",
                    selectedUser?.id === u.id && "bg-muted"
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={undefined} />
                      <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-background",
                        u.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                      )}
                     />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.role}</p>
                  </div>
                  {unreadCount > 0 && (
                     <Badge className="h-6 w-6 shrink-0 justify-center rounded-full p-0">{unreadCount}</Badge>
                  )}
                </button>
              )
          })}
        </div>
      </aside>
      
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
               <div className="relative">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={undefined} />
                  <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-background",
                    allUsers.find(u => u.id === selectedUser.id)?.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                  )}
                 />
               </div>
              <h1 className="text-xl font-semibold">{selectedUser.name}</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {isLoading ? (
                  <p className="text-center text-muted-foreground">Cargando mensajes...</p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-muted-foreground">Aún no hay mensajes. ¡Sé el primero en saludar!</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex items-start gap-3",
                        message.userId === user?.id ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.userId !== user?.id && (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={undefined} />
                          <AvatarFallback>{message.userName.charAt(0)}</AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={cn(
                          "max-w-xs rounded-lg p-3 text-sm lg:max-w-md",
                          message.userId === user?.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <p className="font-semibold">{message.userName}</p>
                        <p className="mt-1">{message.text}</p>
                        <div className="flex items-center justify-end mt-2 text-xs opacity-70 gap-1">
                          <span>
                            {formatDistanceToNow(message.timestamp, { addSuffix: true, locale: es })}
                          </span>
                          {message.userId === user?.id && <ReadReceipt isRead={message.isRead} />}
                        </div>
                      </div>
                       {message.userId === user?.id && (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={undefined} />
                          <AvatarFallback>{message.userName.charAt(0)}</AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </main>
            <footer className="sticky bottom-0 z-10 border-t bg-background/80 p-4 backdrop-blur-sm">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Enviar mensaje a ${selectedUser.name}...`}
                  autoComplete="off"
                />
                <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <UserCircle className="mx-auto h-12 w-12" />
              <p className="mt-4">Seleccione un usuario para comenzar a chatear.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
