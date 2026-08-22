import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  PostType,
  type Comment,
  type CommentsPage,
  type CreateCommentInput,
  type CreatePostInput,
  type CreatePostResult,
  type Post as PostDto,
  type PostsPage,
  type ToggleLikeResult,
  type UpdatePostInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { CommunityPostsService } from './community-posts.service';
import { CommunityCommentsService } from './community-comments.service';
import { CommunityLikesService } from './community-likes.service';
import { createPostSchema, updatePostSchema } from './community-posts.schemas';
import { createCommentSchema } from './community-comments.schemas';

function parseType(value?: string): PostType | undefined {
  return value && (Object.values(PostType) as string[]).includes(value)
    ? (value as PostType)
    : undefined;
}

/**
 * M11 (comunidad) — publicaciones, comentarios y likes. Cualquier usuario
 * autenticado (organización o Persona) puede publicar/comentar/dar like —
 * sin `@Roles`, mismo patrón que "Mis donaciones"/"Mis ofertas" (el backend
 * no discrimina por rol aquí, solo por identidad). La moderación de
 * plataforma vive en un controller separado.
 */
@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityPostsController {
  constructor(
    private readonly posts: CommunityPostsService,
    private readonly comments: CommunityCommentsService,
    private readonly likes: CommunityLikesService,
  ) {}

  @Post('posts')
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createPostSchema)) dto: CreatePostInput,
  ): Promise<CreatePostResult> {
    return this.posts.create(actor, dto);
  }

  @Get('posts')
  feed(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PostsPage> {
    return this.posts.feed(Number(limit), Number(offset), parseType(type));
  }

  @Get('posts/mine')
  mine(
    @CurrentUser() actor: RequestUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PostsPage> {
    return this.posts.mine(actor, Number(limit), Number(offset));
  }

  @Get('posts/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PostDto> {
    return this.posts.get(id);
  }

  @Patch('posts/:id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) dto: UpdatePostInput,
  ): Promise<PostDto> {
    return this.posts.update(actor, id, dto);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  remove(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.posts.remove(actor, id);
  }

  @Post('posts/:id/comments')
  addComment(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: CreateCommentInput,
  ): Promise<Comment> {
    return this.comments.create(actor, id, dto);
  }

  @Get('posts/:id/comments')
  listComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<CommentsPage> {
    return this.comments.list(id, Number(limit), Number(offset));
  }

  @Delete('comments/:id')
  @HttpCode(204)
  removeComment(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.comments.removeOwn(actor, id);
  }

  @Post('posts/:id/like')
  toggleLike(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ToggleLikeResult> {
    return this.likes.toggle(actor.id, id);
  }
}
