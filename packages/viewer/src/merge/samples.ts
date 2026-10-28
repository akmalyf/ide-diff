// Demo 3-way merge (PHP): non-conflicting changes on both sides, real conflicts and one conflict that
// "Resolve simple conflicts" (magic wand) can resolve.

const base = `<?php

declare(strict_types=1);

namespace App\\Service;

use App\\Entity\\Order;
use App\\Repository\\OrderRepository;
use Psr\\Log\\LoggerInterface;

final class OrderService
{
    private const MAX_ITEMS = 50;

    public function __construct(
        private OrderRepository $orders,
        private LoggerInterface $logger,
    ) {
    }

    public function find(int $id): ?Order
    {
        return $this->orders->find($id);
    }

    public function total(Order $order): float
    {
        $sum = 0.0;
        foreach ($order->getItems() as $item) {
            $sum += $item->getPrice() * $item->getQuantity();
        }

        return $sum;
    }

    public function place(Order $order): void
    {
        if (count($order->getItems()) > self::MAX_ITEMS) {
            throw new \\InvalidArgumentException('Too many items');
        }

        $this->orders->save($order);
        $this->logger->info('Order placed', ['id' => $order->getId()]);
    }

    public function cancel(Order $order): void
    {
        $order->setStatus('cancelled');
        $this->orders->save($order);
    }
}
`;

const left = `<?php

declare(strict_types=1);

namespace App\\Service;

use App\\Entity\\Order;
use App\\Event\\OrderPlaced;
use App\\Repository\\OrderRepository;
use Psr\\Log\\LoggerInterface;

final class OrderService
{
    private const MAX_ITEMS = 100;

    public function __construct(
        private OrderRepository $orders,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function find(int $id): ?Order
    {
        return $this->orders->find($id);
    }

    public function total(Order $order): float
    {
        $sum = 0.0;
        foreach ($order->getItems() as $item) {
            $sum += $item->getUnitPrice() * $item->getQuantity();
        }

        return $sum;
    }

    public function place(Order $order): void
    {
        if (count($order->getItems()) > self::MAX_ITEMS) {
            throw new \\DomainException('Order has too many items');
        }

        $this->orders->save($order);
        $this->logger->info('Order placed', ['id' => $order->getId()]);
    }

    public function cancel(Order $order): void
    {
        $order->setStatus('cancelled');
        $this->orders->save($order);
    }
}
`;

const right = `<?php

declare(strict_types=1);

namespace App\\Service;

use App\\Entity\\Order;
use App\\Repository\\OrderRepository;
use Psr\\Log\\LoggerInterface;

final class OrderService
{
    private const MAX_ITEMS = 75;

    public function __construct(
        private OrderRepository $orders,
        private LoggerInterface $logger,
    ) {
    }

    public function find(int $id): ?Order
    {
        return $this->orders->findOneBy(['id' => $id]);
    }

    public function total(Order $order): float
    {
        $sum = 0.0;
        foreach ($order->getItems() as $item) {
            $sum += $item->getPrice() * $item->getAmount();
        }

        return round($sum, 2);
    }

    public function place(Order $order): void
    {
        if (count($order->getItems()) > self::MAX_ITEMS) {
            throw new \\InvalidArgumentException(sprintf('Too many items (max %d)', self::MAX_ITEMS));
        }

        $this->orders->save($order);
        $this->logger->info('Order placed', ['id' => $order->getId()]);
    }

    public function cancel(Order $order): void
    {
        $order->setStatus('cancelled');
        $order->setCancelledAt(new \\DateTimeImmutable());
        $this->orders->save($order);
    }
}
`;

export const mergeSamplePhp = {
  left,
  base,
  right,
  leftTitle: 'OrderService.php (Local Changes)',
  baseTitle: 'Result',
  rightTitle: 'OrderService.php (Changes from origin/main)',
};
