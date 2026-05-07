
"use client";

import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from 'date-fns/locale';
import {
  Bell,
  Ticket,
  XCircle,
  CheckCircle2,
  CalendarPlus,
  Clock,
  AlertTriangle,
  FileText,
  CreditCard,
  UserPlus,
  ThumbsUp,
  ThumbsDown,
  User,
} from "lucide-react";
import { getNotifications, subscribeToUsers, updateDoc, doc, db, getDoc, arrayUnion } from "@/lib/data";
import type { Notification, NotificationType, Guide, User as UserType } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const notificationIcons: Record<NotificationType, React.ElementType> = {
    BOOKING_CREATED: Ticket,
    CANCELLATION_REQUESTED: XCircle,
    CANCELLATION_APPROVED: CheckCircle2,
    CANCELLATION_REJECTED: XCircle,
    PAYMENT_NOTICE_SENT: FileText,
    PAYMENT_CONFIRMED: CreditCard,
    AVAILABILITY_UPDATED: CalendarPlus,
    AVAILABILITY_REQUEST: UserPlus,
    DEPARTURE_ADDED: Clock,
    LOW_AVAILABILITY_WARNING: AlertTriangle,
    GENERIC: Bell,
};

const notificationColors: Record<NotificationType, string> = {
    BOOKING_CREATED: "text-blue-500",
    CANCELLATION_REQUESTED: "text-orange-500",
    CANCELLATION_APPROVED: "text-green-500",
    CANCELLATION_REJECTED: "text-red-500",
    PAYMENT_NOTICE_SENT: "text-purple-500",
    PAYMENT_CONFIRMED: "text-green-600",
    AVAILABILITY_UPDATED: "text-indigo-500",
    AVAILABILITY_REQUEST: "text-teal-500",
    DEPARTURE_ADDED: "text-cyan-500",
    LOW_AVAILABILITY_WARNING: "text-yellow-500",
    GENERIC: "text-gray-500",
};


function NotificationList({ notifications, onMarkAsRead, onAvailabilityRequest }: { notifications: Notification[], onMarkAsRead: (id: string) => void, onAvailabilityRequest: (notif: Notification, accept: boolean) => void }) {
  if (notifications.length === 0) {
    return (
      <div className="text-center py-8">
        <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">No hay notificaciones para mostrar aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notifications.map((notification) => {
        const Icon = notificationIcons[notification.type] || Bell;
        const color = notificationColors[notification.type] || "text-gray-500";
        return (
          <div key={notification.id} className="flex items-start gap-4">
            <span className={cn("mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-muted", color)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="flex-1 space-y-2">
              <p className="text-sm">{notification.message}</p>
              <p className="text-xs text-muted-foreground">
                por <strong>{notification.userName}</strong>
                {notification.agencyName && ` (${notification.agencyName})`}
                - <span title={format(notification.timestamp, "PPPpp", { locale: es })}>{formatDistanceToNow(notification.timestamp, { addSuffix: true, locale: es })}</span>
              </p>
              {notification.type === 'AVAILABILITY_REQUEST' && !notification.isRead && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-100 hover:text-green-700" onClick={() => onAvailabilityRequest(notification, true)}>
                    <ThumbsUp className="h-4 w-4 mr-2" /> Aceptar
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-600 hover:bg-red-100 hover:text-red-700" onClick={() => onAvailabilityRequest(notification, false)}>
                    <ThumbsDown className="h-4 w-4 mr-2" /> Rechazar
                  </Button>
                </div>
              )}
            </div>
            {!notification.isRead && notification.type !== 'AVAILABILITY_REQUEST' && (
              <Button variant="ghost" size="sm" onClick={() => onMarkAsRead(notification.id)}>Marcar como leído</Button>
            )}
          </div>
        )
      })}
    </div>
  );
}


export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [allUsers, setAllUsers] = React.useState<UserType[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchNotifications = React.useCallback(async () => {
    setIsLoading(true);
    try {
        const notificationsData = await getNotifications();
        setNotifications(notificationsData);
    } catch (error) {
        console.error("Failed to fetch notifications", error);
    } finally {
        setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchNotifications();
    
    if (user?.role === 'super-admin') {
        const unsubscribe = subscribeToUsers((usersData) => {
            setAllUsers(usersData);
        });
        return () => unsubscribe();
    }
  }, [fetchNotifications, user?.role]);

  const filteredNotifications = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin' || user.role === 'super-admin') {
      return notifications.filter(n => n.targetUserId === undefined || n.targetUserId === null);
    }
    if (user.role === 'agent' || user.role === 'vendedor') {
      return notifications.filter(n => n.agencyId === user.agencyId);
    }
    if (user.role === 'guia') {
      return notifications.filter(n => n.targetUserId === user.id);
    }
    return [];
  }, [user, notifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    const notificationRef = doc(db, "notifications", notificationId);
    try {
        await updateDoc(notificationRef, { isRead: true });
        setNotifications(prev => prev.map(n => n.id === notificationId ? {...n, isRead: true} : n));
    } catch (error) {
        console.error("Error marking notification as read:", error);
    }
  };

  const handleAvailabilityRequest = async (notification: Notification, accept: boolean) => {
    if (!user || user.role !== 'guia' || !user.guideId || !notification.metadata?.date) {
      return;
    }

    if (accept) {
      try {
        const guideRef = doc(db, "guides", user.guideId);
        const guideSnap = await getDoc(guideRef);

        if (guideSnap.exists()) {
          const guideData = guideSnap.data() as Guide;
          const requestedDate = new Date(notification.metadata.date);
          
          const alreadyAvailable = guideData.availableDates.some(d => new Date(d).toDateString() === requestedDate.toDateString());
          
          if (!alreadyAvailable) {
             await updateDoc(guideRef, {
                availableDates: arrayUnion(requestedDate)
             });
          }

          toast({
            title: "Disponibilidad Confirmada",
            description: `Te has anotado para trabajar el ${format(requestedDate, "PPP", { locale: es })}.`
          });
        }
      } catch (error) {
        console.error("Error accepting availability request:", error);
        toast({ title: "Error", description: "No se pudo actualizar tu disponibilidad.", variant: "destructive" });
      }
    }

    await handleMarkAsRead(notification.id);
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Cargando notificaciones...</p>
      </div>
    );
  }

  const sortedUsers = allUsers.sort((a,b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Centro de Notificaciones
        </h1>
      </div>
      
      <Card>
        {user?.role === 'super-admin' ? (
             <Tabs defaultValue="general">
                <div className="border-b">
                    <TabsList className="px-4 -mb-px h-auto justify-start">
                        <TabsTrigger value="general">Actividad General</TabsTrigger>
                        {sortedUsers.map(u => (
                             <TabsTrigger key={u.id} value={u.id} className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={u.photoURL} alt={u.name} />
                                    <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                {u.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                <TabsContent value="general">
                     <CardHeader>
                        <CardTitle>Actividad General</CardTitle>
                        <CardDescription>
                            Un registro de todas las acciones importantes del sistema.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <NotificationList 
                            notifications={filteredNotifications}
                            onMarkAsRead={handleMarkAsRead}
                            onAvailabilityRequest={handleAvailabilityRequest}
                        />
                    </CardContent>
                </TabsContent>
                 {sortedUsers.map(u => (
                    <TabsContent key={u.id} value={u.id}>
                        <CardHeader>
                            <CardTitle>Actividad de {u.name}</CardTitle>
                            <CardDescription>
                                Un registro de todas las acciones realizadas por este usuario.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <NotificationList
                                notifications={notifications.filter(n => n.relatedUserId === u.id)}
                                onMarkAsRead={handleMarkAsRead}
                                onAvailabilityRequest={handleAvailabilityRequest}
                            />
                        </CardContent>
                    </TabsContent>
                ))}
             </Tabs>
        ) : (
             <>
             <CardHeader>
                <CardTitle>Actividad Reciente</CardTitle>
                <CardDescription>
                    Un registro de todas las acciones importantes relacionadas con tu cuenta.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <NotificationList 
                    notifications={filteredNotifications}
                    onMarkAsRead={handleMarkAsRead}
                    onAvailabilityRequest={handleAvailabilityRequest}
                />
            </CardContent>
            </>
        )}
      </Card>
    </div>
  );
}


    