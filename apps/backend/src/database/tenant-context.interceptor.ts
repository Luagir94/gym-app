import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, switchMap } from 'rxjs';
import { TenantPrismaService } from './tenant-prisma.service';

/**
 * TenantContextInterceptor — reads tenantId from the validated JWT claims
 * and sets it in TenantPrismaService via AsyncLocalStorage for the request lifetime.
 *
 * Must run AFTER JwtAuthGuard (which populates request.user).
 * Applied globally via DatabaseModule or per-controller.
 *
 * Spec: "the request is rejected with HTTP 400 before any DB query executes"
 * when tenantId is missing.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantService: TenantPrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: { tenantId?: string } }>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new BadRequestException(
        'Missing tenantId in JWT claims — cannot process request without tenant context',
      );
    }

    // Wrap the downstream handler inside runWithTenant so that all async
    // operations downstream see the correct tenantId via AsyncLocalStorage.
    // switchMap allows us to stay in the RxJS pipeline while running the ALS context.
    return new Observable((subscriber) => {
      this.tenantService.runWithTenant(tenantId, async () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      }).catch((err) => subscriber.error(err));
    });
  }
}
