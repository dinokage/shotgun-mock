import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import {
  useChatGroupsStore,
  useChatMessagesStore,
  ChatGroup,
} from "@/store/chatGroups";
import { ChatMessage, Department } from "@/data/mockData";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
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
import { useIsLeadership } from "@/hooks/use-capability";
import { DEPARTMENT_LEADERSHIP_ROLES } from "@/store/permissions";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

// Synthetic "channel" representing all studio members. It isn't a real row in
// DEPARTMENTS, so any lookup that resolves the active channel needs to check
// for this id before falling back to the real department list.
const EVERYONE_DEPT: Department = {
  id: "everyone",
  name: "Everyone",
  abbreviation: "ALL",
  color: "#6b7280",
  supervisorId: "",
  leadId: "",
  studioId: "studio1",
  description: "All studio members",
  icon: "Users",
  pipelineOrder: 0,
  pipeline: "PROD",
};

export default function Chat() {
  const { currentUser } = useAuthStore();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const { toast } = useToast();
  const { groups, addGroup, getOrCreateDM } = useChatGroupsStore();
  const { messages, addMessage } = useChatMessagesStore();
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

  // A user can see all departments if they are studio leadership, otherwise just their own.
  const isLeadership = useIsLeadership();

  const visibleDepartments = useMemo(() => {
    if (isLeadership) return [EVERYONE_DEPT, ...departments];
    return [
      EVERYONE_DEPT,
      ...departments.filter((d) => d.id === currentUser?.departmentId),
    ];
  }, [currentUser, isLeadership, departments]);

  const myGroups = useMemo(() => {
    if (!currentUser) return [];
    return groups.filter((g) => g.memberIds.includes(currentUser.id));
  }, [groups, currentUser]);

  const myDMs = useMemo(() => myGroups.filter((g) => g.isDM), [myGroups]);
  const myTeamGroups = useMemo(
    () => myGroups.filter((g) => !g.isDM),
    [myGroups],
  );

  const [activeDeptId, setActiveDeptId] = useState<string>(
    visibleDepartments[0]?.id || "",
  );

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeDeptId),
    [groups, activeDeptId],
  );

  // A DM channel is shared by two people but stores a generic name — show
  // the other participant's name instead of the raw group name.
  const groupDisplayName = (group: ChatGroup) => {
    if (group.isDM && currentUser) {
      const otherId = group.memberIds.find((id) => id !== currentUser.id);
      const other = otherId ? users.find((u) => u.id === otherId) : undefined;
      return other?.name || group.name;
    }
    return group.name;
  };

  const activeDept = useMemo(() => {
    if (activeDeptId === "everyone") return EVERYONE_DEPT;
    const dept = departments.find((d) => d.id === activeDeptId);
    if (dept) return dept;
    if (activeGroup)
      return {
        ...EVERYONE_DEPT,
        id: activeGroup.id,
        name: groupDisplayName(activeGroup),
      };
    return undefined;
  }, [activeDeptId, activeGroup, currentUser, departments]);

  // Open the requested person's DM when arriving via /chat?user=<id> (e.g.
  // the "Message" button on a profile page).
  const targetUserId = searchParams.get("user");
  useEffect(() => {
    if (!currentUser || !targetUserId || targetUserId === currentUser.id)
      return;
    const targetUser = users.find((u) => u.id === targetUserId);
    if (!targetUser) return;
    const id = getOrCreateDM(currentUser.id, targetUser.id);
    setActiveDeptId(id);
  }, [targetUserId, currentUser?.id, getOrCreateDM, users]);

  const openDMWithUser = (userId: string) => {
    if (!currentUser || userId === currentUser.id) return;
    setLocation(`/chat?user=${userId}`);
  };

  const deptUsers = useMemo(() => {
    let source;
    if (activeDeptId === "everyone") {
      source = [...users];
    } else if (activeGroup) {
      source = users.filter((u) => activeGroup.memberIds.includes(u.id));
    } else {
      source = users.filter((u) => u.departmentId === activeDeptId);
    }
    return source.sort((a, b) => {
      // Sort leadership to top
      const aIsLead = DEPARTMENT_LEADERSHIP_ROLES.includes(a.role);
      const bIsLead = DEPARTMENT_LEADERSHIP_ROLES.includes(b.role);
      if (aIsLead && !bIsLead) return -1;
      if (!aIsLead && bIsLead) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [activeDeptId, activeGroup, users]);

  const deptMessages = useMemo(() => {
    return messages
      .filter((m) => m.departmentId === activeDeptId)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
  }, [messages, activeDeptId]);

  const handleSend = () => {
    if (!inputText.trim() || !currentUser) return;
    const newMsg: ChatMessage = {
      id: `m_${Date.now()}`,
      departmentId: activeDeptId,
      userId: currentUser.id,
      text: inputText,
      attachments: [],
      timestamp: new Date().toISOString(),
    };
    addMessage(newMsg);
    setInputText("");
  };

  // Reads the real file the user picked and attaches it to the channel.
  // No AI analysis or "logging" happens here — none exists in this app.
  const handleAttachmentSelected = (
    file: File,
    type: "image" | "video" | "file",
  ) => {
    if (!currentUser) return;
    const url = URL.createObjectURL(file);
    const newMsg: ChatMessage = {
      id: `m_${Date.now()}`,
      departmentId: activeDeptId,
      userId: currentUser.id,
      text: "",
      attachments: [
        {
          id: `att_${Date.now()}`,
          name: file.name,
          type,
          url,
        },
      ],
      timestamp: new Date().toISOString(),
    };
    addMessage(newMsg);
    toast({
      title: "Attachment added",
      description: `${file.name} was shared in #${activeDept?.name ?? "this channel"}.`,
    });
  };

  const handleFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "video" | "file",
  ) => {
    const file = e.target.files?.[0];
    if (file) handleAttachmentSelected(file, type);
    e.target.value = "";
  };

  const openGroupDialog = () => {
    setNewGroupName("");
    setNewGroupMemberIds(currentUser ? new Set([currentUser.id]) : new Set());
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
    if (!currentUser || !newGroupName.trim() || newGroupMemberIds.size === 0)
      return;
    const group = {
      id: `group_${Date.now()}`,
      name: newGroupName.trim(),
      memberIds: Array.from(newGroupMemberIds),
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    addGroup(group);
    setActiveDeptId(group.id);
    setGroupDialogOpen(false);
    toast({
      title: "Group Created",
      description: `#${group.name} is ready with ${group.memberIds.length} member${group.memberIds.length === 1 ? "" : "s"}.`,
    });
  };

  if (!currentUser) return null;

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
            {visibleDepartments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => setActiveDeptId(dept.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  activeDeptId === dept.id
                    ? "bg-primary/10 text-primary font-medium hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Hash className="w-4 h-4 opacity-70" />
                {dept.name}
              </button>
            ))}

            {myDMs.length > 0 && (
              <>
                <div className="text-xs font-semibold text-muted-foreground mb-2 mt-4 px-2 uppercase tracking-wider">
                  Direct Messages
                </div>
                <AnimatePresence initial={false}>
                  {myDMs.map((group, i) => (
                    <motion.button
                      key={group.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.03 }}
                      onClick={() => setActiveDeptId(group.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        activeDeptId === group.id
                          ? "bg-primary/10 text-primary font-medium hover:bg-primary/15"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <MessageCircle className="w-4 h-4 opacity-70" />
                      {groupDisplayName(group)}
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
                  {myTeamGroups.map((group, i) => (
                    <motion.button
                      key={group.id}
                      {...fadeInUp}
                      transition={{ ...fadeInUp.transition, delay: i * 0.03 }}
                      onClick={() => setActiveDeptId(group.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        activeDeptId === group.id
                          ? "bg-primary/10 text-primary font-medium hover:bg-primary/15"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Users className="w-4 h-4 opacity-70" />
                      {group.name}
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
            <h2 className="font-bold text-lg">{activeDept?.name}</h2>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {deptMessages.length === 0 ? (
              <Empty className="py-10 border-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {activeGroup?.isDM ? (
                      <MessageCircle className="w-6 h-6" />
                    ) : (
                      <Hash className="w-6 h-6" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>Welcome to {activeDept?.name}!</EmptyTitle>
                  <EmptyDescription>
                    This is the start of the conversation.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              deptMessages.map((msg, i) => {
                const user = users.find((u) => u.id === msg.userId);
                const showHeader =
                  i === 0 ||
                  deptMessages[i - 1].userId !== msg.userId ||
                  new Date(msg.timestamp).getTime() -
                    new Date(deptMessages[i - 1].timestamp).getTime() >
                    300000;

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
                            {format(new Date(msg.timestamp), "h:mm a")}
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
                        {msg.text}
                      </div>

                      {msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att, idx) =>
                            att.type === "file" ? (
                              <a
                                key={idx}
                                href={att.url}
                                download={att.name}
                                className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/60 transition-colors max-w-sm"
                              >
                                <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{att.name}</span>
                              </a>
                            ) : (
                              <div
                                key={idx}
                                className="relative rounded-lg overflow-hidden border border-border group cursor-pointer max-w-sm"
                              >
                                {att.type === "image" ? (
                                  <img
                                    src={att.url}
                                    alt={att.name}
                                    className="w-full h-auto max-h-64 object-cover"
                                  />
                                ) : (
                                  <div className="bg-black/90 w-full aspect-video flex items-center justify-center relative">
                                    <Video className="w-12 h-12 text-white/50 absolute" />
                                    <video
                                      src={att.url}
                                      className="w-full h-full opacity-50 object-cover"
                                    />
                                  </div>
                                )}
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="text-xs text-white truncate block">
                                    {att.name}
                                  </span>
                                </div>
                              </div>
                            ),
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

        {/* Input Area */}
        <div className="p-4 bg-card/50 backdrop-blur-sm shrink-0">
          <div className="relative flex items-end gap-2 bg-muted/30 border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all shadow-sm">
            <div className="flex gap-1 pb-1">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileInputChange(e, "image")}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFileInputChange(e, "video")}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFileInputChange(e, "file")}
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
              placeholder={`Message #${activeDept?.name}...`}
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
      </div>

      {/* Roster Sidebar (Right) */}
      <div className="w-64 bg-sidebar/30 border-l border-border flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">
            Department Members — {deptUsers.length}
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
                {deptUsers
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
                {deptUsers
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
