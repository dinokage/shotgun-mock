import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import {
  useChatChannels,
  useChatMessages,
  usePostChatMessage,
  useCreateChatChannel,
  useOpenDirectMessage,
  useJoinChatChannel,
  useMarkChannelRead,
  useUploadChatAttachment,
  attachmentKind,
  type ChatChannelDTO,
} from "@/hooks/useChat";
import { useUserStore } from "@/store/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Hash,
  Send,
  Paperclip,
  Image as ImageIcon,
  Video,
  Shield,
  User as UserIcon,
  Plus,
  Users,
  MessageCircle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { fadeInUp } from "@/lib/motion";
import { DEPARTMENT_LEADERSHIP_ROLES } from "@/store/permissions";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export default function Chat() {
  const { currentUser } = useAuthStore();
  const users = useUserStore((s) => s.users);
  const { toast } = useToast();

  // Which channels come back is already scoped server-side (membership, plus
  // the public channels this role is allowed to join) -- this list is not a
  // display convenience, it's the boundary.
  const { data: channels = [] } = useChatChannels();
  const postMessage = usePostChatMessage();
  const createChannel = useCreateChatChannel();
  const openDirectMessage = useOpenDirectMessage();
  const joinChannel = useJoinChatChannel();
  const markRead = useMarkChannelRead();
  const uploadAttachment = useUploadChatAttachment();

  const [inputText, setInputText] = useState("");
  const [searchParams] = useSearchParams();
  const [, setLocation] = useLocation();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<Set<string>>(
    new Set(),
  );

  const [activeChannelId, setActiveChannelId] = useState<string>("");

  const publicChannels = useMemo(
    () => channels.filter((c) => c.kind === "channel"),
    [channels],
  );
  const myDMs = useMemo(() => channels.filter((c) => c.kind === "dm"), [channels]);
  const myTeamGroups = useMemo(
    () => channels.filter((c) => c.kind === "group"),
    [channels],
  );

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId),
    [channels, activeChannelId],
  );

  useEffect(() => {
    if (activeChannelId || channels.length === 0) return;
    const first = channels.find((c) => c.isMember) ?? channels[0];
    setActiveChannelId(first.id);
  }, [channels, activeChannelId]);

  // A DM channel is shared by two people but stores a generic name — show
  // the other participant's name instead of the raw channel name.
  const channelDisplayName = (channel: ChatChannelDTO) => {
    if (channel.kind === "dm" && currentUser) {
      const otherId = channel.memberIds.find((id) => id !== currentUser.id);
      const other = otherId ? users.find((u) => u.id === otherId) : undefined;
      return other?.name || channel.name;
    }
    return channel.name;
  };

  // The transcript is only requested once membership is real — the server
  // refuses to read out a channel the caller hasn't joined, so asking before
  // the join lands would just 403.
  const {
    messages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useChatMessages(activeChannel?.isMember ? activeChannelId : null);

  useEffect(() => {
    if (activeChannel?.isMember && activeChannel.unreadCount > 0) {
      markRead.mutate(activeChannel.id);
    }
  }, [activeChannel?.id, activeChannel?.isMember, activeChannel?.unreadCount]);

  const selectChannel = (channel: ChatChannelDTO) => {
    setActiveChannelId(channel.id);
    if (!channel.isMember) joinChannel.mutate(channel.id);
  };

  // Open the requested person's DM when arriving via /chat?user=<id> (e.g.
  // the "Message" button on a profile page). The ref keeps a re-run of this
  // effect from firing a second get-or-create for the same person before the
  // first one has come back.
  const targetUserId = searchParams.get("user");
  const openedDMFor = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || !targetUserId || targetUserId === currentUser.id)
      return;
    if (openedDMFor.current === targetUserId) return;
    openedDMFor.current = targetUserId;
    openDirectMessage.mutate(targetUserId, {
      onSuccess: (channel) => setActiveChannelId(channel.id),
    });
  }, [targetUserId, currentUser?.id]);

  const openDMWithUser = (userId: string) => {
    if (!currentUser || userId === currentUser.id) return;
    setLocation(`/chat?user=${userId}`);
  };

  const rosterUsers = useMemo(() => {
    if (!activeChannel) return [];
    let source;
    if (activeChannel.kind === "channel" && !activeChannel.departmentId) {
      source = [...users];
    } else if (activeChannel.kind === "channel") {
      source = users.filter((u) => u.departmentId === activeChannel.departmentId);
    } else {
      source = users.filter((u) => activeChannel.memberIds.includes(u.id));
    }
    return source.sort((a, b) => {
      // Sort leadership to top
      const aIsLead = DEPARTMENT_LEADERSHIP_ROLES.includes(a.role);
      const bIsLead = DEPARTMENT_LEADERSHIP_ROLES.includes(b.role);
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [activeChannel, users]);

  const handleSend = () => {
    if (!inputText.trim() || !activeChannelId) return;
    postMessage.mutate({ channelId: activeChannelId, body: inputText });
    setInputText("");
  };

  // Uploads the real file the user picked, then posts it as this channel's
  // next message. No AI analysis or "logging" happens here — none exists in
  // this app.
  const handleAttachmentSelected = (file: File) => {
    if (!activeChannelId) return;
    uploadAttachment.mutate(
      { channelId: activeChannelId, file },
      {
        onSuccess: (uploaded) => {
          postMessage.mutate({
            channelId: activeChannelId,
            attachmentUrl: uploaded.url,
            attachmentName: uploaded.name,
          });
          toast({
            title: "Attachment added",
            description: `${file.name} was shared in #${activeChannel?.name ?? "this channel"}.`,
          });
        },
        onError: (err: Error) => {
          toast({
            title: "Attachment failed",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAttachmentSelected(file);
    e.target.value = "";
  };

  const openGroupDialog = () => {
    setNewGroupName("");
    setNewGroupMemberIds(new Set());
    setGroupDialogOpen(true);
  };

  const toggleGroupMember = (userId: string) => {
    setNewGroupMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || newGroupMemberIds.size === 0) return;
    createChannel.mutate(
      {
        kind: "group",
        name: newGroupName.trim(),
        memberIds: Array.from(newGroupMemberIds),
      },
      {
        onSuccess: (channel) => {
          setActiveChannelId(channel.id);
          setGroupDialogOpen(false);
          toast({
            title: "Group Created",
            description: `#${channel.name} is ready with ${channel.memberIds.length} member${channel.memberIds.length === 1 ? "" : "s"}.`,
          });
        },
        onError: (err: Error) => {
          toast({
            title: "Could not create group",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  if (!currentUser) return null;

  const channelButtonClass = (id: string) =>
    `w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
      activeChannelId === id
        ? "bg-primary/10 text-primary font-medium hover:bg-primary/15"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const unreadBadge = (channel: ChatChannelDTO) =>
    channel.unreadCount > 0 && channel.id !== activeChannelId ? (
      <span className="ml-auto text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
        {channel.unreadCount}
      </span>
    ) : null;

  return (
    <div className="flex h-full w-full bg-background border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Channels Sidebar */}
      <div className="w-64 bg-sidebar/50 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Team Chat</h2>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 hover:bg-muted"
            title="Create Group"
            onClick={openGroupDialog}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider">
              Channels
            </div>
            {publicChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => selectChannel(channel)}
                className={channelButtonClass(channel.id)}
              >
                <Hash className="w-4 h-4 opacity-70" />
                {channel.name}
                {unreadBadge(channel)}
              </button>
            ))}

            {myDMs.length > 0 && (
              <>
                <div className="text-xs font-semibold text-muted-foreground mb-2 mt-4 px-2 uppercase tracking-wider">
                  Direct Messages
                </div>
                <AnimatePresence initial={false}>
                  {myDMs.map((channel, i) => (
                    <motion.button
                      key={channel.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.03 }}
                      onClick={() => selectChannel(channel)}
                      className={channelButtonClass(channel.id)}
                    >
                      <MessageCircle className="w-4 h-4 opacity-70" />
                      {channelDisplayName(channel)}
                      {unreadBadge(channel)}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </>
            )}

            {myTeamGroups.length > 0 && (
              <>
                <div className="text-xs font-semibold text-muted-foreground mb-2 mt-4 px-2 uppercase tracking-wider">
                  Groups
                </div>
                <AnimatePresence initial={false}>
                  {myTeamGroups.map((channel, i) => (
                    <motion.button
                      key={channel.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.03 }}
                      onClick={() => selectChannel(channel)}
                      className={channelButtonClass(channel.id)}
                    >
                      <Users className="w-4 h-4 opacity-70" />
                      {channel.name}
                      {unreadBadge(channel)}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Name the group and pick who's in it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Group Name</Label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Shot Review Task Force"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Members ({newGroupMemberIds.size} selected)</Label>
              <ScrollArea className="h-56 rounded-md border border-border p-2">
                <div className="space-y-1">
                  {users.filter((u) => u.id !== currentUser.id).map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2.5 p-1.5 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={newGroupMemberIds.has(u.id)}
                        onCheckedChange={() => toggleGroupMember(u.id)}
                      />
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={u.avatar} />
                        <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {u.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {u.title}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || newGroupMemberIds.size === 0}
            >
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-card">
        {/* Chat Header */}
        <div className="h-14 border-b border-border flex items-center px-6 shrink-0 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-bold text-lg">
              {activeChannel ? channelDisplayName(activeChannel) : ""}
            </h2>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? "Loading…" : "Load earlier messages"}
                </Button>
              </div>
            )}
            {messages.length === 0 ? (
              <Empty className="py-10 border-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {activeChannel?.kind === "dm" ? (
                      <MessageCircle className="w-6 h-6" />
                    ) : (
                      <Hash className="w-6 h-6" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    Welcome to{" "}
                    {activeChannel ? channelDisplayName(activeChannel) : "chat"}!
                  </EmptyTitle>
                  <EmptyDescription>
                    This is the start of the conversation.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              messages.map((msg, i) => {
                const user = users.find((u) => u.id === msg.authorId);
                const showHeader =
                  i === 0 ||
                  messages[i - 1].authorId !== msg.authorId ||
                  new Date(msg.createdAt).getTime() -
                    new Date(messages[i - 1].createdAt).getTime() >
                    300000;
                const kind = attachmentKind(msg.attachmentUrl);

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-3xl ${showHeader ? "mt-6" : "mt-1"}`}
                  >
                    {showHeader ? (
                      <Avatar className="w-10 h-10 border border-border shadow-sm shrink-0">
                        <AvatarImage src={user?.avatar} />
                        <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-10 shrink-0" /> // Spacer for alignment
                    )}

                    <div className="flex-1 min-w-0">
                      {showHeader && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-[15px]">
                            {user?.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.createdAt), "h:mm a")}
                          </span>
                          {!!user &&
                            DEPARTMENT_LEADERSHIP_ROLES.includes(
                              user.role,
                            ) && (
                            <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded ml-1">
                              Lead
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-[15px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {msg.body}
                      </div>

                      {msg.attachmentUrl && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {kind === "file" ? (
                            <a
                              href={msg.attachmentUrl}
                              download={msg.attachmentName ?? undefined}
                              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/60 transition-colors max-w-sm"
                            >
                              <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                {msg.attachmentName}
                              </span>
                            </a>
                          ) : (
                            <div className="relative rounded-lg overflow-hidden border border-border group cursor-pointer max-w-sm">
                              {kind === "image" ? (
                                <img
                                  src={msg.attachmentUrl}
                                  alt={msg.attachmentName ?? ""}
                                  className="w-full h-auto max-h-64 object-cover"
                                />
                              ) : (
                                <div className="bg-black/90 w-full aspect-video flex items-center justify-center relative">
                                  <Video className="w-12 h-12 text-white/50 absolute" />
                                  <video
                                    src={msg.attachmentUrl}
                                    className="w-full h-full opacity-50 object-cover"
                                  />
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs text-white truncate block">
                                  {msg.attachmentName}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Input Area -- the admin monitors the studio, they don't do
            production work or take part in team conversations, so they get
            a read-only view of every channel instead of a send box. */}
        {currentUser?.role === "admin" ? (
          <div className="p-4 bg-card/50 backdrop-blur-sm shrink-0 text-center text-xs text-muted-foreground border-t border-border">
            Admin accounts are view-only here — you can read every channel but not send messages.
          </div>
        ) : (
        <div className="p-4 bg-card/50 backdrop-blur-sm shrink-0">
          <div className="relative flex items-end gap-2 bg-muted/30 border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all shadow-sm">
            <div className="flex gap-1 pb-1">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                title="Attach Image"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                title="Attach Video"
                onClick={() => videoInputRef.current?.click()}
              >
                <Video className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                title="Attach File"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Message #${activeChannel ? channelDisplayName(activeChannel) : ""}...`}
              className="flex-1 max-h-32 min-h-[40px] bg-transparent border-0 focus:ring-0 p-2 resize-none text-[15px]"
              rows={1}
            />

            <Button
              onClick={handleSend}
              disabled={!inputText.trim()}
              size="icon"
              className={`h-9 w-9 shrink-0 rounded-lg mb-0.5 ${inputText.trim() ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"}`}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-2">
            Attach an image, video, or file to share it in this channel.
          </div>
        </div>
        )}
      </div>

      {/* Roster Sidebar (Right) */}
      <div className="w-64 bg-sidebar/30 border-l border-border flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">
            Department Members — {rosterUsers.length}
          </h2>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Leadership Group */}
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> Leadership
              </div>
              <div className="space-y-1">
                {rosterUsers
                  .filter((u) => DEPARTMENT_LEADERSHIP_ROLES.includes(u.role))
                  .map((u) => (
                    <div
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDMWithUser(u.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDMWithUser(u.id);
                        }
                      }}
                      className="flex items-center gap-2.5 p-1.5 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Avatar className="w-7 h-7 border shadow-sm relative">
                        <AvatarImage src={u.avatar} />
                        <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                        <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-white rounded-full"></div>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {u.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {u.title}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Artists Group */}
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-2 flex items-center gap-1.5">
                <UserIcon className="w-3 h-3" /> Artists
              </div>
              <div className="space-y-1">
                {rosterUsers
                  .filter((u) => !DEPARTMENT_LEADERSHIP_ROLES.includes(u.role))
                  .map((u) => (
                    <div
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDMWithUser(u.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDMWithUser(u.id);
                        }
                      }}
                      className="flex items-center gap-2.5 p-1.5 rounded hover:bg-muted/50 cursor-pointer opacity-80 hover:opacity-100"
                    >
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={u.avatar} />
                        <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {u.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {u.title}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
