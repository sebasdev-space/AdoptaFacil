-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "author_user_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "moderation_reason" TEXT,
    "moderated_by_user_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_images" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "post_id" UUID NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "post_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_post_likes" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_likes_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateIndex
CREATE INDEX "community_posts_organization_id_idx" ON "community_posts"("organization_id");
CREATE INDEX "community_posts_type_idx" ON "community_posts"("type");
CREATE INDEX "community_posts_status_idx" ON "community_posts"("status");
CREATE INDEX "community_posts_author_user_id_idx" ON "community_posts"("author_user_id");
CREATE INDEX "community_post_images_organization_id_idx" ON "community_post_images"("organization_id");
CREATE INDEX "community_post_images_post_id_idx" ON "community_post_images"("post_id");
CREATE INDEX "community_comments_organization_id_idx" ON "community_comments"("organization_id");
CREATE INDEX "community_comments_post_id_idx" ON "community_comments"("post_id");
CREATE INDEX "community_post_likes_organization_id_idx" ON "community_post_likes"("organization_id");

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "community_post_images" ADD CONSTRAINT "community_post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_likes" ADD CONSTRAINT "community_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation, to
-- avoid editing the Organization model in org.prisma — another owner's file).
-- Nullable: a platform-wide (Persona-authored) post has no organization row.
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_images" ADD CONSTRAINT "community_post_images_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_post_likes" ADD CONSTRAINT "community_post_likes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — M11 comunidad. A row with organization_id
-- IS NULL is invisible under EVERY tenant context (NULL never satisfies the
-- equality) and is only reachable through the SECURITY DEFINER functions
-- below — this is intentional, not a gap: a platform-wide post has no owning
-- tenant to show it to via the normal per-org path.
-- ============================================================================

ALTER TABLE "community_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_posts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_posts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_post_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_post_images" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_post_images"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_comments"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "community_post_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_post_likes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "community_post_likes"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- LEAST-PRIVILEGE GRANTS (M11). An organization fully self-manages its OWN
-- posts (create/list/edit/delete) through the normal RLS path. Comments and
-- likes are ALWAYS written through the SECURITY DEFINER functions below (the
-- author is almost never a member of the post's org) — the app role gets
-- SELECT only on those two tables, as defense in depth.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON "community_posts" TO adoptafacil_app;
GRANT SELECT, INSERT ON "community_post_images" TO adoptafacil_app;
GRANT SELECT ON "community_comments" TO adoptafacil_app;
GRANT SELECT ON "community_post_likes" TO adoptafacil_app;

-- ============================================================================
-- Shared JSONB post projection, duplicated per function on purpose (matches
-- the existing convention in this codebase — e.g. public_resource_needs /
-- public_resource_need — rather than a shared SQL view).
-- ============================================================================

-- Platform-wide (Persona-authored) post creation. Bypasses RLS deliberately:
-- an organization_id IS NULL row can never satisfy the tenant_isolation
-- WITH CHECK under ANY context, so this is the only way such a row gets
-- created. Org-authored posts do NOT use this function — they go through the
-- normal withOrgContext + Prisma path (real tenant match).
CREATE OR REPLACE FUNCTION create_community_post_platform(
  p_author_user_id UUID,
  p_author_name TEXT,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row "community_posts";
BEGIN
  INSERT INTO "community_posts" (
    id, organization_id, author_user_id, author_name, type, title, body, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), NULL, p_author_user_id, p_author_name, p_type, p_title, p_body,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'authorUserId', v_row.author_user_id,
    'authorName', v_row.author_name,
    'type', v_row.type,
    'title', v_row.title,
    'body', v_row.body,
    'status', v_row.status,
    'commentCount', v_row.comment_count,
    'likeCount', v_row.like_count,
    'moderationReason', v_row.moderation_reason,
    'createdAt', to_char(v_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(v_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- Cross-tenant FEED: published posts across every organization + platform-wide
-- posts, newest first, optional type filter.
CREATE OR REPLACE FUNCTION community_posts_feed(p_limit INTEGER, p_offset INTEGER, p_type TEXT)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'authorUserId', p.author_user_id,
        'authorName', p.author_name,
        'type', p.type,
        'title', p.title,
        'body', p.body,
        'status', p.status,
        'commentCount', p.comment_count,
        'likeCount', p.like_count,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "community_post_images" i WHERE i.post_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p.status = 'published'
        AND (p_type IS NULL OR p.type = p_type)
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts"
      WHERE "status" = 'published' AND (p_type IS NULL OR "type" = p_type))
  );
$$;

-- Cross-tenant "mis publicaciones": own posts (any status), by author identity.
CREATE OR REPLACE FUNCTION community_posts_by_author(p_author_user_id UUID, p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'authorUserId', p.author_user_id,
        'authorName', p.author_name,
        'type', p.type,
        'title', p.title,
        'body', p.body,
        'status', p.status,
        'commentCount', p.comment_count,
        'likeCount', p.like_count,
        'moderationReason', p.moderation_reason,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "community_post_images" i WHERE i.post_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p.author_user_id = p_author_user_id
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts" WHERE "author_user_id" = p_author_user_id)
  );
$$;

-- Cross-tenant single post read (permalink), published only.
CREATE OR REPLACE FUNCTION community_post_get(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'organizationId', p.organization_id,
    'organizationName', o.name,
    'authorUserId', p.author_user_id,
    'authorName', p.author_name,
    'type', p.type,
    'title', p.title,
    'body', p.body,
    'status', p.status,
    'commentCount', p.comment_count,
    'likeCount', p.like_count,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
      ) ORDER BY i.order)
      FROM "community_post_images" i WHERE i.post_id = p.id
    ), '[]'::jsonb),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM "community_posts" p
  LEFT JOIN "organizations" o ON o.id = p.organization_id
  WHERE p.id = p_id AND p.status = 'published';
$$;

-- Update own post (title/body only); only while published. Ownership enforced
-- by author identity, not by tenant context (a Persona's post has none).
CREATE OR REPLACE FUNCTION community_post_update_own(
  p_id UUID, p_author_user_id UUID, p_title TEXT, p_body TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row "community_posts";
BEGIN
  SELECT * INTO v_row FROM "community_posts" WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_row.author_user_id <> p_author_user_id THEN
    RAISE EXCEPTION 'not the author of this post';
  END IF;
  IF v_row.status <> 'published' THEN
    RAISE EXCEPTION 'cannot edit a removed post';
  END IF;

  UPDATE "community_posts"
     SET title = COALESCE(p_title, title),
         body = COALESCE(p_body, body),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'authorUserId', v_row.author_user_id,
    'authorName', v_row.author_name,
    'type', v_row.type,
    'title', v_row.title,
    'body', v_row.body,
    'status', v_row.status,
    'commentCount', v_row.comment_count,
    'likeCount', v_row.like_count,
    'createdAt', to_char(v_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(v_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- Delete own post (hard delete; cascades to images/comments/likes). Ownership
-- enforced by author identity.
CREATE OR REPLACE FUNCTION community_post_delete_own(p_id UUID, p_author_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_author UUID;
BEGIN
  SELECT author_user_id INTO v_author FROM "community_posts" WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_author <> p_author_user_id THEN
    RAISE EXCEPTION 'not the author of this post';
  END IF;
  DELETE FROM "community_posts" WHERE id = p_id;
  RETURN true;
END;
$$;

-- Create a comment (cross-tenant by identity — the commenter is almost never
-- a member of the post's org). Increments the post's denormalized counter
-- atomically. Only on a published post.
CREATE OR REPLACE FUNCTION create_community_comment(
  p_post_id UUID, p_author_user_id UUID, p_author_name TEXT, p_body TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post_org UUID;
  v_post_status TEXT;
  v_row "community_comments";
BEGIN
  SELECT organization_id, status INTO v_post_org, v_post_status
    FROM "community_posts" WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_post_status <> 'published' THEN
    RAISE EXCEPTION 'cannot comment on a removed post';
  END IF;

  INSERT INTO "community_comments" (
    id, organization_id, post_id, author_user_id, author_name, body, created_at
  ) VALUES (
    gen_random_uuid(), v_post_org, p_post_id, p_author_user_id, p_author_name, p_body,
    CURRENT_TIMESTAMP
  ) RETURNING * INTO v_row;

  UPDATE "community_posts" SET comment_count = comment_count + 1 WHERE id = p_post_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'postId', v_row.post_id,
    'authorUserId', v_row.author_user_id,
    'authorName', v_row.author_name,
    'body', v_row.body,
    'createdAt', to_char(v_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- List comments for a post, cross-tenant, oldest first (conversation order).
CREATE OR REPLACE FUNCTION community_comments_for_post(p_post_id UUID, p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') ASC) FROM (
      SELECT jsonb_build_object(
        'id', c.id,
        'postId', c.post_id,
        'authorUserId', c.author_user_id,
        'authorName', c.author_name,
        'body', c.body,
        'createdAt', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_comments" c
      WHERE c.post_id = p_post_id
      ORDER BY c.created_at ASC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_comments" WHERE "post_id" = p_post_id)
  );
$$;

-- Delete own comment; decrements the post's denormalized counter.
CREATE OR REPLACE FUNCTION community_comment_delete_own(p_comment_id UUID, p_author_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_author UUID;
  v_post_id UUID;
BEGIN
  SELECT author_user_id, post_id INTO v_author, v_post_id
    FROM "community_comments" WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment not found';
  END IF;
  IF v_author <> p_author_user_id THEN
    RAISE EXCEPTION 'not the author of this comment';
  END IF;
  DELETE FROM "community_comments" WHERE id = p_comment_id;
  UPDATE "community_posts" SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = v_post_id;
  RETURN true;
END;
$$;

-- Toggle a like (cross-tenant by identity). Only on a published post.
CREATE OR REPLACE FUNCTION toggle_community_post_like(p_post_id UUID, p_user_id UUID)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post_org UUID;
  v_post_status TEXT;
  v_liked BOOLEAN;
  v_like_count INTEGER;
BEGIN
  SELECT organization_id, status INTO v_post_org, v_post_status
    FROM "community_posts" WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;
  IF v_post_status <> 'published' THEN
    RAISE EXCEPTION 'cannot like a removed post';
  END IF;

  IF EXISTS (SELECT 1 FROM "community_post_likes" WHERE post_id = p_post_id AND user_id = p_user_id) THEN
    DELETE FROM "community_post_likes" WHERE post_id = p_post_id AND user_id = p_user_id;
    UPDATE "community_posts" SET like_count = GREATEST(like_count - 1, 0) WHERE id = p_post_id
      RETURNING like_count INTO v_like_count;
    v_liked := false;
  ELSE
    INSERT INTO "community_post_likes" (post_id, user_id, organization_id, created_at)
      VALUES (p_post_id, p_user_id, v_post_org, CURRENT_TIMESTAMP);
    UPDATE "community_posts" SET like_count = like_count + 1 WHERE id = p_post_id
      RETURNING like_count INTO v_like_count;
    v_liked := true;
  END IF;

  RETURN jsonb_build_object('liked', v_liked, 'likeCount', v_like_count);
END;
$$;

-- Cross-tenant moderation queue (M11): every post regardless of org, newest
-- first, optional status filter. PlatformAdmin/PlatformSuperAdmin only
-- (enforced at the controller) — this function is the only cross-tenant path.
CREATE OR REPLACE FUNCTION community_posts_moderation_queue(p_limit INTEGER, p_offset INTEGER, p_status TEXT)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'authorUserId', p.author_user_id,
        'authorName', p.author_name,
        'type', p.type,
        'title', p.title,
        'body', p.body,
        'status', p.status,
        'commentCount', p.comment_count,
        'likeCount', p.like_count,
        'moderationReason', p.moderation_reason,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "community_post_images" i WHERE i.post_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "community_posts" p
      LEFT JOIN "organizations" o ON o.id = p.organization_id
      WHERE p_status IS NULL OR p.status = p_status
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "community_posts" WHERE p_status IS NULL OR "status" = p_status)
  );
$$;

-- Apply a moderation decision (remove/restore). Audited against the post's
-- own org when it has one, falling back to the AUTHOR's personal tenant
-- (every user, including a Persona, has exactly one) when the post itself
-- carries no organization — so a platform-wide post's moderation is still
-- traceable, never silently unaudited.
CREATE OR REPLACE FUNCTION community_post_moderate(
  p_post_id UUID, p_decision TEXT, p_reviewer_user_id UUID, p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row "community_posts";
  v_status TEXT;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_audit_org UUID;
BEGIN
  IF p_decision NOT IN ('remove', 'restore') THEN
    RAISE EXCEPTION 'community_post_moderate: invalid decision "%"', p_decision;
  END IF;
  IF p_decision = 'remove' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required to remove a post';
  END IF;

  SELECT * INTO v_row FROM "community_posts" WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post not found';
  END IF;

  v_status := CASE p_decision WHEN 'remove' THEN 'removed' ELSE 'published' END;

  UPDATE "community_posts"
     SET status = v_status,
         moderation_reason = CASE WHEN p_decision = 'remove' THEN v_reason ELSE NULL END,
         moderated_by_user_id = p_reviewer_user_id,
         moderated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = p_post_id
   RETURNING * INTO v_row;

  v_audit_org := v_row.organization_id;
  IF v_audit_org IS NULL THEN
    SELECT organization_id INTO v_audit_org FROM "users" WHERE id = v_row.author_user_id;
  END IF;

  IF v_audit_org IS NOT NULL THEN
    INSERT INTO audit_logs (
      id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
    ) VALUES (
      gen_random_uuid(), v_audit_org, p_reviewer_user_id,
      'community_post.' || v_status,
      'community_post', v_row.id::text,
      jsonb_build_object('decision', p_decision, 'reason', v_reason),
      CURRENT_TIMESTAMP
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'authorUserId', v_row.author_user_id,
    'authorName', v_row.author_name,
    'type', v_row.type,
    'title', v_row.title,
    'body', v_row.body,
    'status', v_row.status,
    'commentCount', v_row.comment_count,
    'likeCount', v_row.like_count,
    'moderationReason', v_row.moderation_reason,
    'createdAt', to_char(v_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(v_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

REVOKE ALL ON FUNCTION create_community_post_platform(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_posts_feed(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_posts_by_author(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_post_get(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_post_update_own(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_post_delete_own(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_community_comment(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_comments_for_post(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_comment_delete_own(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION toggle_community_post_like(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_posts_moderation_queue(INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_post_moderate(UUID, TEXT, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_community_post_platform(UUID, TEXT, TEXT, TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_posts_feed(INTEGER, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_posts_by_author(UUID, INTEGER, INTEGER) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_post_get(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_post_update_own(UUID, UUID, TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_post_delete_own(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION create_community_comment(UUID, UUID, TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_comments_for_post(UUID, INTEGER, INTEGER) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_comment_delete_own(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION toggle_community_post_like(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_posts_moderation_queue(INTEGER, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION community_post_moderate(UUID, TEXT, UUID, TEXT) TO adoptafacil_app;
