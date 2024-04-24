package appliance

import (
	"context"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/sourcegraph/sourcegraph/internal/k8s/resource/container"
	"github.com/sourcegraph/sourcegraph/internal/k8s/resource/deployment"
	"github.com/sourcegraph/sourcegraph/internal/k8s/resource/pod"
	"github.com/sourcegraph/sourcegraph/internal/k8s/resource/pvc"
	"github.com/sourcegraph/sourcegraph/internal/k8s/resource/service"
	"github.com/sourcegraph/sourcegraph/lib/errors"
	"github.com/sourcegraph/sourcegraph/lib/pointers"
)

func (r *Reconciler) reconcileBlobstore(ctx context.Context, sg *Sourcegraph, owner client.Object) error {
	if err := r.reconcileBlobstorePersistentVolumeClaims(ctx, sg, owner); err != nil {
		return err
	}

	if err := r.reconcileBlobstoreServices(ctx, sg, owner); err != nil {
		return err
	}

	if err := r.reconcileBlobstoreDeployments(ctx, sg, owner); err != nil {
		return err
	}

	return nil
}

func buildBlobstorePersistentVolumeClaim(sg *Sourcegraph) (corev1.PersistentVolumeClaim, error) {
	storage := sg.Spec.Blobstore.StorageSize
	if storage == "" {
		storage = "100Gi"
	}

	if _, err := resource.ParseQuantity(storage); err != nil {
		return corev1.PersistentVolumeClaim{}, errors.Errorf("invalid blobstore storage size: %s", storage)
	}

	storageClassName := sg.Spec.StorageClass.Name
	if storageClassName == "" {
		storageClassName = "sourcegraph"
	}

	p := pvc.NewPersistentVolumeClaim("blobstore", sg.Namespace)
	p.Spec.Resources = corev1.VolumeResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceStorage: resource.MustParse(storage),
		},
	}

	// set StorageClass name if a custom storage class is being sgeated.
	if sg.Spec.StorageClass.Create {
		p.Spec.StorageClassName = &storageClassName
	}

	return p, nil
}

func (r *Reconciler) reconcileBlobstorePersistentVolumeClaims(ctx context.Context, sg *Sourcegraph, owner client.Object) error {
	p, err := buildBlobstorePersistentVolumeClaim(sg)
	if err != nil {
		return err
	}

	return reconcileBlobStoreObject(ctx, r, &p, &corev1.PersistentVolumeClaim{}, sg, owner)
}

func buildBlobstoreService(sg *Sourcegraph) corev1.Service {
	name := "blobstore"

	s := service.NewService(name, sg.Namespace)
	s.Spec.Ports = []corev1.ServicePort{
		{
			Name:       name,
			Port:       9000,
			TargetPort: intstr.FromString(name),
		},
	}
	s.Spec.Selector = map[string]string{
		"app": name,
	}

	return s
}

func (r *Reconciler) reconcileBlobstoreServices(ctx context.Context, sg *Sourcegraph, owner client.Object) error {
	s := buildBlobstoreService(sg)
	return reconcileBlobStoreObject(ctx, r, &s, &corev1.Service{}, sg, owner)
}

func buildBlobstoreDeployment(sg *Sourcegraph) appsv1.Deployment {
	name := "blobstore"

	containerPorts := []corev1.ContainerPort{{
		Name:          name,
		ContainerPort: 9000,
	}}

	containerResources := corev1.ResourceRequirements{
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("1"),
			corev1.ResourceMemory: resource.MustParse("500M"),
		},
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("1"),
			corev1.ResourceMemory: resource.MustParse("500M"),
		},
	}
	if sg.Spec.Blobstore.Resources != nil {
		limCPU := sg.Spec.Blobstore.Resources.Limits.Cpu()
		limMem := sg.Spec.Blobstore.Resources.Limits.Memory()
		reqCPU := sg.Spec.Blobstore.Resources.Limits.Cpu()
		reqMem := sg.Spec.Blobstore.Resources.Limits.Memory()

		containerResources = corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    pointers.DerefZero(limCPU),
				corev1.ResourceMemory: pointers.DerefZero(limMem),
			},
			Requests: corev1.ResourceList{
				corev1.ResourceCPU:    pointers.DerefZero(reqCPU),
				corev1.ResourceMemory: pointers.DerefZero(reqMem),
			},
		}
	}

	if sg.Spec.LocalDevMode {
		containerResources = corev1.ResourceRequirements{}
	}

	containerVolumeMounts := []corev1.VolumeMount{
		{
			Name:      "blobstore",
			MountPath: "/blobstore",
		},
		{
			Name:      "blobstore-data",
			MountPath: "/data",
		},
	}

	defaultContainer := container.NewContainer(name)

	// TODO: https://github.com/sourcegraph/sourcegraph/issues/62076
	defaultContainer.Image = "index.docker.io/sourcegraph/blobstore:5.3.2@sha256:d625be1eefe61cc42f94498e3c588bf212c4159c8b20c519db84eae4ff715efa"

	defaultContainer.Ports = containerPorts
	defaultContainer.Resources = containerResources
	defaultContainer.VolumeMounts = containerVolumeMounts

	podVolumes := []corev1.Volume{
		{
			Name: "blobstore",
			VolumeSource: corev1.VolumeSource{
				EmptyDir: &corev1.EmptyDirVolumeSource{},
			},
		},
		{
			Name: "blobstore-data",
			VolumeSource: corev1.VolumeSource{
				PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
					ClaimName: "blobstore",
				},
			},
		},
	}

	podTemplate := pod.NewPodTemplate(name)
	podTemplate.Template.Spec.Containers = []corev1.Container{defaultContainer}
	podTemplate.Template.Spec.Volumes = podVolumes

	defaultDeployment := deployment.NewDeployment(
		name,
		sg.Namespace,
		sg.Spec.RequestedVersion,
	)
	defaultDeployment.Spec.Template = podTemplate.Template

	return defaultDeployment
}

func (r *Reconciler) reconcileBlobstoreDeployments(ctx context.Context, sg *Sourcegraph, owner client.Object) error {
	d := buildBlobstoreDeployment(sg)
	return reconcileBlobStoreObject(ctx, r, &d, &appsv1.Deployment{}, sg, owner)
}

func reconcileBlobStoreObject[T client.Object](ctx context.Context, r *Reconciler, obj, objKind T, sg *Sourcegraph, owner client.Object) error {
	if sg.Spec.Blobstore.Disabled {
		return r.ensureObjectDeleted(ctx, obj)
	}

	// Any secrets (or other configmaps) referenced in BlobStoreSpec can be
	// added to this struct so that they are hashed, and cause an update to the
	// Deployment if changed.
	updateIfChanged := struct {
		BlobstoreSpec
		Version string
	}{
		BlobstoreSpec: sg.Spec.Blobstore,
		Version:       sg.Spec.RequestedVersion,
	}

	return createOrUpdateObject(ctx, r, updateIfChanged, owner, obj, objKind)
}