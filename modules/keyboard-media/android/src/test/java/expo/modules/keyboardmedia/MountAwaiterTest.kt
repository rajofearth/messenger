package expo.modules.keyboardmedia

import org.junit.Assert.*
import org.junit.Test

class MountAwaiterTest {
  private class Harness {
    val queue = mutableListOf<Runnable>()
    val awaiter = MountAwaiter<Any>({ queue.add(it) }, { queue.remove(it) }, maxAttempts = 3)
    val errors = mutableListOf<Exception>()
    val attached = mutableListOf<Any>()
    fun tick() { queue.removeAt(0).run() }
  }

  @Test fun attachBeforeFabricMountWaitsInsteadOfRejecting() {
    val h = Harness()
    var mounted: Any? = null
    h.awaiter.start("input", { mounted }, h.attached::add, h.errors::add)
    assertTrue("attach rejected before Fabric mounted: ${h.errors}", h.errors.isEmpty())
    assertTrue(h.attached.isEmpty())
    h.tick()
    mounted = Any()
    h.tick()
    assertSame(mounted, h.attached.single())
    assertTrue(h.errors.isEmpty())
    assertTrue(h.queue.isEmpty())
  }

  @Test fun detachCancelsPendingAttachAndSettlesIt() {
    val h = Harness()
    var mounted: Any? = null
    h.awaiter.start("input", { mounted }, h.attached::add, h.errors::add)
    h.awaiter.cancel("input")
    mounted = Any()
    assertTrue(h.queue.isEmpty())
    assertTrue(h.attached.isEmpty())
    assertEquals(1, h.errors.size)
    assertTrue(h.errors.single().message!!.contains("cancelled"))
  }

  @Test fun missingViewHasBoundedFailure() {
    val h = Harness()
    h.awaiter.start("input", { null }, h.attached::add, h.errors::add)
    repeat(2) { h.tick() }
    assertEquals(1, h.errors.size)
    assertTrue(h.errors.single().message!!.contains("after 3 attempts"))
    assertTrue(h.queue.isEmpty())
  }

  @Test fun wrongTypeAndListenerFailuresAreNotRetried() {
    val h = Harness()
    val error = IllegalArgumentException("Expected ReactEditText, got ReactViewGroup")
    h.awaiter.start("input", { throw error }, h.attached::add, h.errors::add)
    assertSame(error, h.errors.single())
    assertTrue(h.queue.isEmpty())
    h.errors.clear()
    h.awaiter.start("input", { Any() }, { throw error }, h.errors::add)
    assertSame(error, h.errors.single())
    assertTrue(h.queue.isEmpty())
  }

  @Test fun replacingAndDestroyingPendingRequestsCancelsAllOldWork() {
    val h = Harness()
    h.awaiter.start("input", { null }, h.attached::add, h.errors::add)
    val view = Any()
    h.awaiter.start("input", { view }, h.attached::add, h.errors::add)
    assertSame(view, h.attached.single())
    assertEquals(1, h.errors.size)
    assertTrue(h.queue.isEmpty())
    h.awaiter.start("second", { null }, h.attached::add, h.errors::add)
    h.awaiter.start("third", { null }, h.attached::add, h.errors::add)
    h.awaiter.clear()
    assertTrue(h.queue.isEmpty())
    assertEquals(3, h.errors.size)
  }
}
